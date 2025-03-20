const MAX_FILES = 100;

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);

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
            <title>Markdown Viewer</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://unpkg.com/prismjs@1.29.0/themes/prism.css">
            <link rel="stylesheet" href="https://unpkg.com/prismjs@1.29.0/plugins/toolbar/prism-toolbar.css">
            <script src="https://unpkg.com/prismjs@1.29.0/components/prism-core.min.js"></script>
            <script src="https://unpkg.com/prismjs@1.29.0/plugins/toolbar/prism-toolbar.min.js"></script>
            <script src="https://unpkg.com/prismjs@1.29.0/plugins/copy-to-clipboard/prism-copy-to-clipboard.min.js"></script>
            <script src="https://unpkg.com/prismjs@1.29.0/components/prism-python.min.js"></script>
            <script src="https://unpkg.com/prismjs@1.29.0/components/prism-javascript.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
            <style>
                body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
                .markdown-body { 
                    font-family: 'Inter', sans-serif; 
                    font-size: 22px; 
                    line-height: 1.4; 
                    word-wrap: break-word; 
                    padding: 20px; 
                    box-sizing: border-box; 
                    width: 100vw; 
                    min-height: 100vh; 
                }
                pre { 
                    font-family: 'Inter', sans-serif; 
                    font-size: 18px; 
                    word-wrap: break-word; 
                    white-space: pre-wrap; 
                    background: #f5f5f5; 
                    padding: 10px; 
                    border-radius: 5px; 
                    position: relative; 
                }
                code { 
                    font-family: 'Inter', sans-serif; 
                    font-size: 18px; 
                    word-wrap: break-word; 
                    color: #d32f2f; 
                }
                pre code { color: #000000; }
                .prism-toolbar { 
                    position: absolute; 
                    top: 5px; 
                    right: 5px; 
                }
                .copy-to-clipboard-button { 
                    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>') no-repeat center; 
                    background-size: contain; 
                    width: 24px; 
                    height: 24px; 
                    text-indent: -9999px; 
                    border: none; 
                    padding: 0; 
                    margin: 0; 
                    cursor: pointer; 
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
                    Prism.plugins.toolbar.registerButton('copy-to-clipboard', function(env) {
                        return env.element.querySelector('.copy-to-clipboard-button');
                    });
                });
            </script>
        </head>
        <body class="markdown-body">
            <div id="content"></div>
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
