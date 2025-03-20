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
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-okaidia.min.css">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
            <style>
                body { margin: 0; padding: 0; }
                .markdown-body { 
                    font-size: 40px; 
                    line-height: 1.4; 
                    word-wrap: break-word; 
                    padding: 20px; 
                    box-sizing: border-box; 
                    width: 100vw; 
                    min-height: 100vh; 
                }
                pre, code { 
                    font-size: 36px; 
                    white-space: pre-wrap; 
                    word-wrap: break-word; 
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
