(function () {
    // It pulls the API key passed down dynamically from the bookmarklet loader
    const API_KEY = window.USER_GEMINI_API_KEY;
    if (!API_KEY) {
        alert("Error: API key not provided in the bookmarklet!");
        return;
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${API_KEY}`;

    const style = document.createElement("style");
    style.innerHTML = `
        #ai-select-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.1); z-index: 999999; cursor: crosshair;
        }
        #ai-selection-box {
            position: absolute; border: 2px dashed #4285f4; background: rgba(66, 133, 244, 0.15);
            z-index: 1000000; pointer-events: none;
        }
        #ai-prompt-box {
            position: fixed; z-index: 1000001; background: #fff; padding: 12px;
            border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            font-family: sans-serif; width: 300px; display: flex; flex-direction: column; gap: 8px;
        }
        #ai-prompt-box input {
            padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; outline: none;
        }
        #ai-prompt-box button {
            padding: 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;
        }
        #ai-result-box {
            position: fixed; z-index: 1000001; background: #202124; color: #fff; padding: 12px;
            border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-family: sans-serif; max-width: 350px; font-size: 13px; line-height: 1.4;
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "ai-select-overlay";
    document.body.appendChild(overlay);

    const selectionBox = document.createElement("div");
    selectionBox.id = "ai-selection-box";
    document.body.appendChild(selectionBox);

    let startX = 0, startY = 0, endX = 0, endY = 0;
    let isDrawing = false;

    overlay.addEventListener("mousedown", (e) => {
        isDrawing = true;
        startX = e.clientX + window.scrollX;
        startY = e.clientY + window.scrollY;
        selectionBox.style.left = startX + "px";
        selectionBox.style.top = startY + "px";
        selectionBox.style.width = "0px";
        selectionBox.style.height = "0px";
    });

    overlay.addEventListener("mousemove", (e) => {
        if (!isDrawing) return;
        endX = e.clientX + window.scrollX;
        endY = e.clientY + window.scrollY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        selectionBox.style.left = left + "px";
        selectionBox.style.top = top + "px";
        selectionBox.style.width = width + "px";
        selectionBox.style.height = height + "px";
    });

    overlay.addEventListener("mouseup", (e) => {
        isDrawing = false;
        
        const finalLeft = Math.min(startX, endX);
        const finalTop = Math.min(startY, endY);
        const finalWidth = Math.abs(endX - startX);
        const finalHeight = Math.abs(endY - startY);

        overlay.remove();
        selectionBox.remove();

        const selectedText = getAllContentInArea(finalLeft, finalTop, finalWidth, finalHeight);
        showPromptBox(e.clientX, e.clientY, selectedText);
    });

    function getAllContentInArea(left, top, width, height) {
        if (width < 5 || height < 5) return "No area selected.";

        let capturedItems = [];
        const right = left + width;
        const bottom = top + height;

        const allElements = document.querySelectorAll("*");

        allElements.forEach(el => {
            if (el.id === 'ai-prompt-box' || el.id === 'ai-result-box') return;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const elLeft = rect.left + window.scrollX;
            const elTop = rect.top + window.scrollY;
            const elRight = elLeft + rect.width;
            const elBottom = elTop + rect.height;

            const overlaps = !(elLeft > right || elRight < left || elTop > bottom || elBottom < top);

            if (overlaps) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    if (el.value) capturedItems.push(el.value.trim());
                } else {
                    for (let node of el.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const text = node.nodeValue.trim();
                            if (text && !capturedItems.includes(text)) {
                                capturedItems.push(text);
                            }
                        }
                    }
                }
            }
        });

        return capturedItems.join(" ") || window.getSelection().toString().trim() || "No content found in selected area.";
    }

    function showPromptBox(x, y, contextText) {
        const box = document.createElement("div");
        box.id = "ai-prompt-box";
        box.style.left = Math.min(window.innerWidth - 320, Math.max(10, x)) + "px";
        box.style.top = Math.min(window.innerHeight - 150, Math.max(10, y)) + "px";

        box.innerHTML = `
            <input type="text" id="ai-user-input" placeholder="Type your prompt..." autofocus />
            <button id="ai-send-btn">Ask AI</button>
        `;
        document.body.appendChild(box);

        const input = document.getElementById("ai-user-input");
        const btn = document.getElementById("ai-send-btn");

        const submit = async () => {
            const prompt = input.value.trim();
            if (!prompt) return;
            box.remove();
            showLoading(x, y);
            await callGemini(prompt, contextText, x, y);
        };

        btn.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    }

    function showLoading(x, y) {
        const loadBox = document.createElement("div");
        loadBox.id = "ai-result-box";
        loadBox.style.left = Math.min(window.innerWidth - 370, Math.max(10, x)) + "px";
        loadBox.style.top = Math.min(window.innerHeight - 100, Math.max(10, y)) + "px";
        loadBox.innerText = "Thinking...";
        document.body.appendChild(loadBox);
    }

    async function callGemini(prompt, context, x, y) {
        const loadBox = document.getElementById("ai-result-box");
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Selected Area Content:\n"${context}"\n\nQuestion: ${prompt}\n\nProvide a very short, concise answer based strictly on the selected content above.`
                        }]
                    }]
                })
            });

            const data = await response.json();
            const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
            
            loadBox.innerHTML = `
                <div style="font-weight:bold; margin-bottom:4px; color:#8ab4f8;">Answer:</div>
                <div>${answer}</div>
            `;

            setTimeout(() => {
                const dismiss = () => { loadBox.remove(); window.removeEventListener("click", dismiss); };
                window.addEventListener("click", dismiss);
            }, 100);

        } catch (err) {
            loadBox.innerText = "Error fetching response.";
            console.error(err);
        }
    }
})();
