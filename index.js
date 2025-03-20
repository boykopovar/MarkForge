const MAX_FILES = 200;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const { pathname } = url;

        if (request.method === "POST") {
            let markdownText = await request.text();
            let pageId = generateId();

            await env.KV.put(pageId, markdownText);

            await updateFileList(pageId, env);

            return new Response(`${url.origin}/view/${pageId}`, {
                headers: { "Content-Type": "text/plain" },
            });
        }

        let pathParts = pathname.split("/");
        if (pathParts.includes("view")) {
            let pageId = pathParts[pathParts.length - 1];
            let markdownText = await env.KV.get(pageId) || "# Ошибка\nКонтент не найден.";
            return new Response(renderMarkdown(markdownText), {
                headers: { "Content-Type": "text/html" },
            });
        }

        return new Response("Используйте POST-запрос для загрузки Markdown", {
            headers: { "Content-Type": "text/plain" },
        });
    }
};

function renderMarkdown(md) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MD Viewer</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
            <style>
                body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
                .container {
                    font-family: 'Inter', sans-serif;
                    font-size: 20px;
                    line-height: 1.4;
                    word-wrap: break-word;
                    padding: 20px;
                    box-sizing: border-box;
                    width: 100vw;
                    min-height: 100vh;
                    text-align: left;
                }
                @media (min-width: 768px) {
                    .container {
                        width: 70%;
                        margin: 0 auto;
                    }
                }
                pre {
                    position: relative;
                    font-family: 'Inter', sans-serif;
                    font-size: 16px;
                    background: #f5f5f5;
                    padding: 10px 40px 10px 10px; /* Уменьшаем правый padding, так как убрали одну кнопку */
                    border-radius: 5px;
                    margin: 10px 0;
                    overflow-x: auto; /* Всегда прокручивается горизонтально */
                    white-space: pre; /* Сохраняем пробелы и переносы */
                    word-wrap: normal; /* Без переноса слов */
                }
                code {
                    font-family: 'Inter', sans-serif;
                    font-size: 16px;
                }
                pre code {
                    display: block;
                }
                .language-python, .language-javascript {
                    white-space: inherit !important;
                    word-wrap: inherit !important;
                }
                .copy-btn {
                    position: absolute;
                    top: 10px;
                    right: 10px; /* Теперь единственная кнопка, сдвигаем ближе к краю */
                    background: #e0e0e0;
                    border: none;
                    border-radius: 3px;
                    padding: 5px;
                    cursor: pointer;
                    font-size: 16px;
                }
                .copy-btn:hover {
                    background: #d0d0d0;
                }
                .footer {
                    margin-top: 20px;
                    font-size: 14px;
                    color: #666;
                    text-align: center;
                }
                .footer a {
                    color: #0066cc;
                    text-decoration: none;
                }
                .footer a:hover {
                    text-decoration: underline;
                }
            </style>
            <script>
                document.addEventListener("DOMContentLoaded", () => {
                    marked.setOptions({
                        highlight: function(code, lang) {
                            return Prism.highlight(code, Prism.languages[lang] || Prism.languages.javascript, lang);
                        }
                    });
                    document.getElementById("content").innerHTML = marked.parse(\`${md.replace(/`/g, '\\`')}\`);
                    document.querySelectorAll("pre").forEach(pre => {
                        const copyBtn = document.createElement("button");
                        copyBtn.className = "copy-btn";
                        copyBtn.innerHTML = "📋";
                        copyBtn.onclick = () => {
                            navigator.clipboard.writeText(pre.querySelector("code").innerText);
                            copyBtn.innerHTML = "✅";
                            setTimeout(() => copyBtn.innerHTML = "📋", 2000);
                        };
                        pre.appendChild(copyBtn);
                    });
                });
            </script>
        </head>
        <body>
            <div class="container" id="content"></div>
            <div class="footer">
                Developed by <a href="https://github.com/boykopovar/md" target="_blank">boykopovar</a>
            </div>
        </body>
        </html>
    `;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

async function updateFileList(newFileId, env) {
    let fileListJson = await env.KV.get("file_list");
    let fileList = fileListJson ? JSON.parse(fileListJson) : [];

    fileList.unshift(newFileId);

    while (fileList.length > MAX_FILES) {
        let oldFileId = fileList.pop();
        await env.KV.delete(oldFileId);
    }

    await env.KV.put("file_list", JSON.stringify(fileList));
}