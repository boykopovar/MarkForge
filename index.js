import { marked } from "marked";

const MAX_FILES = 250;

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const { pathname } = url;

            if (request.method === "POST") {
                let markdownText;
                try {
                    markdownText = await request.text();
                } catch (e) {
                    markdownText = "# Ошибка\nНе удалось прочитать тело запроса.";
                }
                const pageId = generateId();

                try {
                    await env.KV.put(pageId, markdownText);
                    await updateFileList(pageId, env);
                } catch (e) {
                    return new Response("Ошибка при сохранении контента", {
                        status: 500,
                        headers: { "Content-Type": "text/plain" },
                    });
                }

                return new Response(`${url.origin}/view/${pageId}`, {
                    headers: { "Content-Type": "text/plain" },
                });
            }

            let pathParts = pathname.split("/");
            if (pathParts.includes("view")) {
                const pageId = pathParts[pathParts.length - 1];
                let markdownText;
                try {
                    markdownText = await env.KV.get(pageId) || "# Ошибка\nКонтент не найден.";
                } catch (e) {
                    markdownText = "# Ошибка\nНе удалось получить контент.";
                }
                return new Response(renderMarkdown(markdownText), {
                    headers: { "Content-Type": "text/html" },
                });
            }

            if (pathParts[1] === "raw") {
                const pageId = pathParts[pathParts.length - 1];
                let markdownText;
                try {
                    markdownText = await env.KV.get(pageId);
                    if (markdownText === null) {
                        return new Response("# Ошибка\nКонтент не найден.", {
                            status: 404,
                            headers: { "Content-Type": "text/plain; charset=utf-8" },
                        });
                    }
                } catch (e) {
                    return new Response("# Ошибка\nНе удалось получить контент.", {
                        status: 500,
                        headers: { "Content-Type": "text/plain; charset=utf-8" },
                    });
                }
                return new Response(markdownText, {
                    headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
            }

            return new Response("Используйте POST-запрос для загрузки Markdown", {
                headers: { "Content-Type": "text/plain" },
            });
        } catch (e) {
            return new Response("Внутренняя ошибка сервера", {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            });
        }
    }
};

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

async function updateFileList(newFileId, env) {
    try {
        let fileListJson;
        try {
            fileListJson = await env.KV.get("file_list");
        } catch (e) {
            fileListJson = null;
        }
        let fileList = fileListJson ? JSON.parse(fileListJson) : [];

        fileList.unshift(newFileId);

        while (fileList.length > MAX_FILES) {
            const oldFileId = fileList.pop();
            try {
                await env.KV.delete(oldFileId);
            } catch (e) {
                console.error(`Не удалось удалить старый файл ${oldFileId}`);
            }
        }

        await env.KV.put("file_list", JSON.stringify(fileList));
    } catch (e) {
        console.error("Ошибка при обновлении списка файлов:", e);
    }
}

function protectMathFormulas(text) {
    return text
        .replace(/\\\\\(/g, "{{MATH_INLINE_START}}")
        .replace(/\\\\\)/g, "{{MATH_INLINE_END}}")
        .replace(/\\\\\[/g, "{{MATH_DISPLAY_START}}")
        .replace(/\\\\\]/g, "{{MATH_DISPLAY_END}}")
        .replace(/\$\$/g, "{{MATH_DOLLAR}}")
        .replace(/\\,/g, "");
}

function restoreMathFormulas(html) {
    return html
        .replace(/{{MATH_INLINE_START}}/g, '\\(')
        .replace(/{{MATH_INLINE_END}}/g, '\\)')
        .replace(/{{MATH_DISPLAY_START}}/g, '\\[')
        .replace(/{{MATH_DISPLAY_END}}/g, '\\]')
        .replace(/{{MATH_DOLLAR}}/g, '$$');
}

function renderMarkdown(md) {
    const protectedMd = protectMathFormulas(md);
    const parsedHtml = marked.parse(protectedMd);
    const restoredHtml = restoreMathFormulas(parsedHtml);
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MarkForge</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔨</text></svg>" type="image/svg+xml">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML"></script>
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
        .container { width: 70%; margin: 0 auto; }
    }
    h1 {
        font-size: 32px;
    }
    h2 {
        font-size: 28px;
    }
    h3 {
        font-size: 24px;
    }
    h4 {
        font-size: 20px;
    }
    h5 {
        font-size: 18px;
    }
    h6 {
        font-size: 16px;
    }
    pre {
        position: relative;
        font-family: 'Inter', sans-serif;
        font-size: 16px;
        background: #f5f5f5;
        padding: 10px 40px 10px 10px;
        border-radius: 5px;
        margin: 10px 0;
        overflow-x: auto;
        white-space: pre;
        word-wrap: normal;
    }
    code {
        font-family: monospace;
        font-size: inherit;
        background: #f5f5f5;
        padding: 2px 4px;
        border-radius: 5px;
    }
    pre code {
        font-family: 'Inter', sans-serif;
        background: #f5f5f5;
        padding: 0;
        font-size: 16px;
    }
    .token.operator, .token.punctuation {
        background: transparent;
        color: #000000;
    }
    .copy-btn {
        position: absolute;
        top: 10px;
        right: 10px;
        background: #e0e0e0;
        border: none;
        border-radius: 3px;
        padding: 5px;
        cursor: pointer;
        font-size: 16px;
    }
    .copy-btn:hover { background: #d0d0d0; }
    .footer {
        margin-top: 20px;
        margin-bottom: 20px;
        font-size: 16px;
        font-family: 'Inter', sans-serif;
        color: #666;
        text-align: center;
    }
    .footer a { color: #0066cc; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    table {
        display: block;
        overflow-x: auto;
        border-collapse: collapse;
        margin: 20px 0;
        font-family: 'Inter', sans-serif;
        font-size: 18px;
    }
    th, td {
        padding: 10px;
        border: 1px solid #ddd;
        text-align: left;
    }
    th {
        background: #f5f5f5;
        font-weight: 700;
    }
    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #f0f0f0; }
    textarea {
        width: 100%;
        height: 150px;
        padding: 10px;
        font-size: 16px;
        margin-bottom: 20px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-family: 'Inter', sans-serif;
    }
    .MathJax_Display {
        overflow-x: auto;
    }
</style>
</head>
<body>
    <div class="container">
        <textarea id="markdown-input" placeholder="Вставьте Markdown здесь..." style="display: none;">${md}</textarea>
        <div id="content">${restoredHtml}</div>
    </div>
    <div class="footer">
        Developed by <a href="https://github.com/boykopovar/MarkForge" target="_blank">boykopovar</a>
    </div>
    <script>
        function protectMathFormulas(text) {
            return text
                .replace(/\\\\\\(/g, "{{MATH_INLINE_START}}")
                .replace(/\\\\\\)/g, "{{MATH_INLINE_END}}")
                .replace(/\\\\\\[/g, "{{MATH_DISPLAY_START}}")
                .replace(/\\\\\\]/g, "{{MATH_DISPLAY_END}}");
        }

        function restoreMathFormulas(html) {
            return html
                .replace(/{{MATH_INLINE_START}}/g, '\\\\(')
                .replace(/{{MATH_INLINE_END}}/g, '\\\\)')
                .replace(/{{MATH_DISPLAY_START}}/g, '\\\\[')
                .replace(/{{MATH_DISPLAY_END}}/g, '\\\\]');
        }

        function updateContent() {
            try {
                const inputText = document.getElementById("markdown-input").value;
                const protectedText = protectMathFormulas(inputText);
                const parsedHtml = marked.parse(protectedText);
                const restoredHtml = restoreMathFormulas(parsedHtml);
                document.getElementById("content").innerHTML = restoredHtml;

                document.querySelectorAll("pre").forEach(pre => {
                    const copyBtn = document.createElement("button");
                    copyBtn.className = "copy-btn";
                    copyBtn.innerHTML = "📋";
                    copyBtn.onclick = () => {
                        try {
                            navigator.clipboard.writeText(pre.querySelector("code").innerText);
                            copyBtn.innerHTML = "✅";
                            setTimeout(() => copyBtn.innerHTML = "📋", 2000);
                        } catch (e) {
                            console.error("Не удалось скопировать текст:", e);
                        }
                    };
                    if (!pre.querySelector(".copy-btn")) pre.appendChild(copyBtn);
                });

                setTimeout(() => {
                    try {
                        MathJax.Hub.Queue(["Typeset", MathJax.Hub, "content"]);
                    } catch (e) {
                        console.error("Не удалось отрендерить MathJax:", e);
                    }
                }, 100);
            } catch (e) {
                console.error("Ошибка при обновлении контента:", e);
            }
        }

        marked.setOptions({
            highlight: function(code, lang) {
                try {
                    return Prism.languages[lang] 
                        ? Prism.highlight(code, Prism.languages[lang], lang)
                        : Prism.highlight(code, Prism.languages.javascript, 'javascript');
                } catch (e) {
                    return code;
                }
            }
        });

        Prism.plugins.autoloader.languages_path = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/';

        document.getElementById("markdown-input").addEventListener("input", updateContent);

        updateContent();
    </script>
</body>
</html>`;
}
