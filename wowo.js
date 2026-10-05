(function() {
    // Clean up any existing instance first
    const existingToolbar = document.getElementById('element-manipulator-toolbar');
    if (existingToolbar) existingToolbar.remove();
    const existingOutline = document.getElementById('em-outline');
    if (existingOutline) existingOutline.remove();
    const existingSelectionBox = document.getElementById('em-selection-box');
    if (existingSelectionBox) existingSelectionBox.remove();
    const existingHandle = document.getElementById('em-resize-handle');
    if (existingHandle) existingHandle.remove();

    let selectedElements = new Set();
    let isResizing = false;
    let isSelecting = false;
    let startX, startY, startWidth, startHeight;
    let historyStack = [];

    function saveState() {
        if (selectedElements.size === 0) return;
        const states = [];
        selectedElements.forEach(el => {
            states.push({
                element: el,
                parent: el.parentNode,
                nextSibling: el.nextSibling,
                style: {
                    backgroundColor: el.style.backgroundColor,
                    color: el.style.color,
                    fontSize: el.style.fontSize,
                    transform: el.style.transform,
                    transformOrigin: el.style.transformOrigin
                }
            });
        });
        historyStack.push(states);
        if (historyStack.length > 50) {
            historyStack.shift();
        }
    }

    // Create minimized square toolbar and overlays
    const toolbar = document.createElement('div');
    toolbar.id = 'element-manipulator-toolbar';
    toolbar.innerHTML = `
        <div style="position: fixed; top: 16px; right: 16px; z-index: 2147483647; background: #18181b; color: #f4f4f5; padding: 12px; border-radius: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4); display: flex; flex-direction: column; gap: 10px; pointer-events: auto; border: 1px solid #27272a; width: 140px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; color: #a1a1aa; font-size: 11px;">
                    BG <input type="color" id="em-bg-color-picker" style="cursor: pointer; border: 1px solid #3f3f46; border-radius: 4px; width: 22px; height: 22px; background: none; padding: 0;">
                </label>
                <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; color: #a1a1aa; font-size: 11px;">
                    Text <input type="color" id="em-text-color-picker" style="cursor: pointer; border: 1px solid #3f3f46; border-radius: 4px; width: 22px; height: 22px; background: none; padding: 0;">
                </label>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; color: #a1a1aa; font-size: 11px;">
                <span>Font</span>
                <input type="range" id="em-font-size-slider" min="8" max="72" value="16" style="cursor: pointer; width: 85px; accent-color: #3b82f6;">
            </div>
            <div style="height: 1px; width: 100%; background: #27272a; margin: 2px 0;"></div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 8px;">
                <button id="em-revert-btn" title="Revert last change" style="background: #3b82f6; color: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">↩</button>
                <button id="em-delete-btn" title="Delete selected elements" style="background: #ef4444; color: white; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">🗑</button>
                <button id="em-close-btn" title="Close completely" style="background: #3f3f46; color: white; border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 12px;">✕</button>
            </div>
        </div>
        <div id="em-outline" style="position: fixed; border: 2px dashed #3b82f6; background: rgba(59, 130, 246, 0.05); z-index: 2147483646; display: none; pointer-events: none;"></div>
        <div id="em-selection-box" style="position: fixed; border: 1px dashed #3b82f6; background: rgba(59, 130, 246, 0.1); z-index: 2147483646; display: none; pointer-events: none;"></div>
        <div id="em-resize-handle" title="Drag to resize / flip" style="position: fixed; width: 14px; height: 14px; background: #3b82f6; border: 2px solid #fff; border-radius: 50%; z-index: 2147483647; display: none; cursor: se-resize; pointer-events: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
    `;
    document.body.appendChild(toolbar);

    const outline = document.getElementById('em-outline');
    const selectionBox = document.getElementById('em-selection-box');
    const resizeHandle = document.getElementById('em-resize-handle');
    const bgColorPicker = document.getElementById('em-bg-color-picker');
    const textColorPicker = document.getElementById('em-text-color-picker');
    const fontSizeSlider = document.getElementById('em-font-size-slider');
    const revertBtn = document.getElementById('em-revert-btn');
    const deleteBtn = document.getElementById('em-delete-btn');
    const closeBtn = document.getElementById('em-close-btn');

    function setStyleDeep(el, property, value) {
        el.style[property] = value;
        el.querySelectorAll('*').forEach(child => {
            child.style[property] = value;
        });
    }

    function isVisible(el) {
        if (!el || el === document.body || el === document.documentElement) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            parseFloat(style.opacity) > 0
        );
    }

    function getVisibleElementAtPoint(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (let el of elements) {
            if (el.id && el.id.startsWith('em-')) continue;
            if (el.closest('#element-manipulator-toolbar')) continue;
            if (isVisible(el)) return el;
        }
        return null;
    }

    function syncControls() {
        if (selectedElements.size === 0) return;
        const firstEl = Array.from(selectedElements)[0];
        const computed = window.getComputedStyle(firstEl);
        const currentSize = parseFloat(computed.fontSize);
        if (!isNaN(currentSize)) {
            fontSizeSlider.value = currentSize;
        }
    }

    function updateOverlay() {
        if (selectedElements.size === 0) {
            outline.style.display = 'none';
            resizeHandle.style.display = 'none';
            return;
        }

        // Calculate bounding box encompassing all selected elements
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let validCount = 0;

        selectedElements.forEach(el => {
            if (!document.body.contains(el)) {
                selectedElements.delete(el);
                return;
            }
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                minX = Math.min(minX, rect.left);
                minY = Math.min(minY, rect.top);
                maxX = Math.max(maxX, rect.right);
                maxY = Math.max(maxY, rect.bottom);
                validCount++;
            }
        });

        if (validCount === 0) {
            outline.style.display = 'none';
            resizeHandle.style.display = 'none';
            return;
        }

        outline.style.display = 'block';
        outline.style.top = `${minY}px`;
        outline.style.left = `${minX}px`;
        outline.style.width = `${maxX - minX}px`;
        outline.style.height = `${maxY - minY}px`;

        resizeHandle.style.display = 'block';
        resizeHandle.style.top = `${maxY - 7}px`;
        resizeHandle.style.left = `${maxX - 7}px`;
    }

    function onMouseMove(e) {
        if (isResizing || isSelecting || selectedElements.size > 0) return;
        const target = getVisibleElementAtPoint(e.clientX, e.clientY);
        if (target) {
            const rect = target.getBoundingClientRect();
            outline.style.display = 'block';
            outline.style.top = `${rect.top}px`;
            outline.style.left = `${rect.left}px`;
            outline.style.width = `${rect.width}px`;
            outline.style.height = `${rect.height}px`;
            resizeHandle.style.display = 'none';
        } else {
            outline.style.display = 'none';
        }
    }

    let mousedownX = 0;
    let mousedownY = 0;

    function onMouseDown(e) {
        if (e.target.closest('#element-manipulator-toolbar')) return;
        if (e.target === resizeHandle) return;

        mousedownX = e.clientX;
        mousedownY = e.clientY;
        isSelecting = true;
        
        selectionBox.style.display = 'block';
        selectionBox.style.left = `${mousedownX}px`;
        selectionBox.style.top = `${mousedownY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
    }

    function onWindowMouseMove(e) {
        if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const rawWidth = startWidth + dx;
            const rawHeight = startHeight + dy;

            const targetFlipX = rawWidth < 0 ? -1 : 1;
            const targetFlipY = rawHeight < 0 ? -1 : 1;

            const absWidth = Math.max(15, Math.abs(rawWidth));
            const absHeight = Math.max(15, Math.abs(rawHeight));

            const scaleX = (absWidth / startWidth) * targetFlipX;
            const scaleY = (absHeight / startHeight) * targetFlipY;

            selectedElements.forEach(el => {
                el.style.transformOrigin = 'top left';
                el.style.transform = `scale(${scaleX}, ${scaleY})`;
            });
            updateOverlay();
            return;
        }

        if (isSelecting) {
            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(currentX, mousedownX);
            const top = Math.min(currentY, mousedownY);
            const width = Math.abs(currentX - mousedownX);
            const height = Math.abs(currentY - mousedownY);

            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
        }
    }

    function onWindowMouseUp(e) {
        if (isResizing) {
            isResizing = false;
            return;
        }

        if (isSelecting) {
            isSelecting = false;
            selectionBox.style.display = 'none';

            const selRect = selectionBox.getBoundingClientRect();
            
            // If it was just a simple click (not much drag)
            if (selRect.width < 5 && selRect.height < 5) {
                const target = getVisibleElementAtPoint(mousedownX, mousedownY);
                if (target) {
                    selectedElements.clear();
                    selectedElements.add(target);
                    syncControls();
                    updateOverlay();
                } else {
                    selectedElements.clear();
                    updateOverlay();
                }
                return;
            }

            // Box selection across all elements
            const allElements = document.querySelectorAll('body *');
            const newlySelected = new Set();

            allElements.forEach(el => {
                if (el.id && el.id.startsWith('em-')) return;
                if (el.closest('#element-manipulator-toolbar')) return;
                if (!isVisible(el)) return;

                const rect = el.getBoundingClientRect();
                // Check intersection between selection box and element rect
                if (!(rect.right < selRect.left || 
                      rect.left > selRect.right || 
                      rect.bottom < selRect.top || 
                      rect.top > selRect.bottom)) {
                    newlySelected.add(el);
                }
            });

            if (newlySelected.size > 0) {
                selectedElements = newlySelected;
                syncControls();
                updateOverlay();
            }
        }
    }

    resizeHandle.addEventListener('mousedown', (e) => {
        if (selectedElements.size === 0) return;
        saveState();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        
        // Use outline bounds as base reference for resizing multiple elements together
        const outlineRect = outline.getBoundingClientRect();
        startWidth = Math.max(10, outlineRect.width);
        startHeight = Math.max(10, outlineRect.height);
        
        e.stopPropagation();
        e.preventDefault();
    });

    bgColorPicker.addEventListener('change', (e) => {
        if (selectedElements.size > 0) {
            saveState();
            selectedElements.forEach(el => {
                el.style.backgroundColor = e.target.value;
            });
        }
    });

    textColorPicker.addEventListener('change', (e) => {
        if (selectedElements.size > 0) {
            saveState();
            selectedElements.forEach(el => {
                setStyleDeep(el, 'color', e.target.value);
            });
        }
    });

    fontSizeSlider.addEventListener('input', (e) => {
        if (selectedElements.size > 0) {
            selectedElements.forEach(el => {
                setStyleDeep(el, 'fontSize', `${e.target.value}px`);
            });
            updateOverlay();
        }
    });

    fontSizeSlider.addEventListener('mousedown', () => {
        if (selectedElements.size > 0) {
            saveState();
        }
    });

    revertBtn.addEventListener('click', () => {
        if (historyStack.length === 0) return;
        const lastStates = historyStack.pop();
        
        selectedElements.clear();
        lastStates.forEach(state => {
            if (state && state.element) {
                if (!document.body.contains(state.element)) {
                    if (state.parent && document.body.contains(state.parent)) {
                        if (state.nextSibling && state.nextSibling.parentNode === state.parent) {
                            state.parent.insertBefore(state.element, state.nextSibling);
                        } else {
                            state.parent.appendChild(state.element);
                        }
                    }
                }
                
                state.element.style.backgroundColor = state.style.backgroundColor;
                state.element.style.color = state.style.color;
                state.element.style.fontSize = state.style.fontSize;
                state.element.style.transform = state.style.transform;
                state.element.style.transformOrigin = state.style.transformOrigin;

                selectedElements.add(state.element);
            }
        });
        syncControls();
        updateOverlay();
    });

    deleteBtn.addEventListener('click', () => {
        if (selectedElements.size > 0) {
            saveState();
            selectedElements.forEach(el => el.remove());
            selectedElements.clear();
            outline.style.display = 'none';
            resizeHandle.style.display = 'none';
        }
    });

    closeBtn.addEventListener('click', () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('mouseup', onWindowMouseUp);
        toolbar.remove();
        outline.remove();
        selectionBox.remove();
        resizeHandle.remove();
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    window.addEventListener('scroll', updateOverlay, true);
    window.addEventListener('resize', updateOverlay);
})();
