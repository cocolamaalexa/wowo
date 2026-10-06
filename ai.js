(function () {
    if (document.getElementById("ai-select-overlay")) return;

    const API_KEY = window.USER_GEMINI_API_KEY;
    if (!API_KEY) {
        alert("Error: API key not provided in the bookmarklet!");
        return;
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    // Dynamically load html2canvas library to capture the exact visual area
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = initSelector;
    document.head.appendChild(script);

    function initSelector() {
        const style = document.createElement("style");
        style.innerHTML = `
            #ai-select-overlay {
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.15); z-index: 2147483647; cursor: crosshair;
            }
            #ai-selection-box {
                position: absolute; border: 2px dashed #4285f4; background: rgba(66, 133, 244, 0.2);
                z-index: 2147483647; pointer-events: none;
            }
            #ai-prompt-box {
                position: fixed; z-index: 2147483647; background: #fff; padding: 12px;
                border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                font-family: sans-serif; width: 300px; display: flex; flex-direction: column; gap: 8px;
            }
            #ai-prompt-box input {
                padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; outline: none; color: #000;
            }
            #ai-prompt-box button {
                padding: 8px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;
            }
            #ai-result-box {
                position: fixed; z-index: 2147483647; background: #202124; color: #fff; padding: 12px;
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

        overlay.addEventListener("mouseup", async (e) => {
            isDrawing = false;
            
            const finalLeft = Math.min(startX, endX);
            const finalTop = Math.min(startY, endY);
            const finalWidth = Math.abs(endX - startX);
            const finalHeight = Math.abs(endY - startY);

            overlay.remove();
            selectionBox.remove();

            if (finalWidth < 10 || finalHeight < 10) {
                alert("Selection too small!");
                return;
            }

            showLoading(e.clientX, e.clientY);

            try {
                // Capture the entire page layout as a canvas image
                const canvas = await html2canvas(document.body, {
                    x: finalLeft,
                    y: finalTop,
                    width: finalWidth,
                    height: finalHeight,
                    windowWidth: document.documentElement.clientWidth,
                    windowHeight: document.documentElement.clientHeight,
                    scrollX: -window.scrollX,
                    scrollY: -window.scrollY,
                    useCORS: true,
                    allowTaint: true
                });

                const base64Image = canvas.toDataURL("image/png").split(",")[1];
                showPromptBox(e.clientX, e.clientY, base64Image);
            } catch (err) {
                console.error(err);
                document.getElementById("ai-result-box").innerText = "Error capturing screenshot.";
            }
        });
    }

    function showLoading(x, y) {
        const loadBox = document.createElement("div");
        loadBox.id = "ai-result-box";
        loadBox.style.left = Math.min(window.innerWidth - 370, Math.max(10, x)) + "px";
        loadBox.style.top = Math.min(window.innerHeight - 100, Math.max(10, y)) + "px";
        loadBox.innerText = "Capturing area...";
        document.body.appendChild(loadBox);
    }

    function showPromptBox(x, y, base64Image) {
        const loadBox = document.getElementById("ai-result-box");
        loadBox.style.width = "300px";
        loadBox.innerHTML = `
            <div style="font-weight:bold; margin-bottom:6px; color:#8ab4f8;">Area Captured! Ask AI:</div>
            <input type="text" id="ai-user-input" placeholder="Type your prompt..." autofocus style="width:100%; padding:8px; border:1px solid #555; border-radius:4px; background:#333; color:#fff; box-sizing:border-box; outline:none;" />
            <button id="ai-send-btn" style="margin-top:6px; width:100%; padding:8px; background:#4285f4; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Send</button>
        `;

        const input = document.getElementById("ai-user-input");
        const btn = document.getElementById("ai-send-btn");

        const submit = async () => {
            const prompt = input.value.trim();
            if (!prompt) return;
            loadBox.innerHTML = "Thinking...";
            await callGeminiWithImage(prompt, base64Image);
        };

        btn.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    }

    async function callGeminiWithImage(prompt, base64Image) {
        const loadBox = document.getElementById("ai-result-box");
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inline_data: {
                                    mime_type: "image/png",
                                    data: base64Image
                                }
                            },
                            {
                                text: `${prompt}\n\nProvide a very short, concise answer based on this screenshot selection.`
                            }
                        ]
                    }]
                })
            });

            const data = await response.json();
            
            if (data.error) {
                loadBox.innerHTML = `<div style="color:#ff8a80; font-weight:bold;">API Error:</div><div>${data.error.message}</div>`;
                return;
            }

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
            loadBox.innerHTML = `<div style="color:#ff8a80; font-weight:bold;">Network Error:</div><div>${err.message}</div>`;
            console.error(err);
        }
    }
})();
