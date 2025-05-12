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
        .replace(/\\,/g, "")
        .replace(/\\int\{([^}]*)\}\{([^}]*)\}/g, "\\int_{$2}^{$3}");
}

function restoreMathFormulas(html) {
    return html
        .replace(/{{MATH_INLINE_START}}/g, '\\(')
        .replace(/{{MATH_INLINE_END}}/g, '\\)')
        .replace(/{{MATH_DISPLAY_START}}/g, '\\[')
        .replace(/{{MATH_DISPLAY_END}}/g, '\\]')
        .replace(/{{MATH_DOLLAR}}/g, '$$');
}

function renderChatMarkdown(chat) {
    return chat.map(entry => {
        let content = entry.content
            .map(part => part.type === "text" ? part.text : "")
            .join(" ")
            .trim();
        let name = "Пользователь";
        if (entry.role === "user") {
            const match = content.match(/^\('([^']+)':\)/);
            if (match) {
                name = match[1];
                content = content.replace(/^\('[^']+':\)/, "").trim();
            }
        } else {
            name = "";
        }
        const parsedContent = marked.parse(protectMathFormulas(content));
        return `<div class="message ${entry.role === 'assistant' ? 'message-assistant' : 'message-user'}">
                    ${name ? `<div class="message-name">${name}</div>` : ""}
                    <div class="message-content">${restoreMathFormulas(parsedContent)}</div>
                </div>`;
    }).join("");
}

function renderMarkdown(md) {
    let chatData;
    let isChatJson = false;

    try {
        chatData = JSON.parse(md);
        if (Array.isArray(chatData) && chatData.every(entry =>
            entry.role && typeof entry.role === "string" &&
            Array.isArray(entry.content) &&
            entry.content.every(part => part.type === "text" && typeof part.text === "string")
        )) {
            isChatJson = true;
        }
    } catch (e) {
        isChatJson = false;
    }

    const content = isChatJson ? renderChatMarkdown(chatData) : marked.parse(protectMathFormulas(md));
    const restoredHtml = restoreMathFormulas(content);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MarkForge</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='80'>✒️</text></svg>" type="image/svg+xml">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #f4f5f7;
            color: #1a1a1a;
            font-family: 'Inter', sans-serif;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        .container {
            flex: 1;
            max-width: 800px;
            margin: 20px auto;
            padding: 0 15px;
            box-sizing: border-box;
        }
        .chat-container {
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 20px;
            min-height: 400px;
            overflow-y: auto;
        }
        .message {
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            max-width: 70%;
        }
        .message-user {
            align-self: flex-start;
        }
        .message-assistant {
            align-self: flex-end;
        }
        .message-name {
            font-size: 14px;
            font-weight: 500;
            color: #555;
            margin-bottom: 5px;
        }
        .message-content {
            background: #e9ecef;
            border-radius: 18px;
            padding: 10px 15px;
            font-size: 16px;
            line-height: 1.5;
            word-wrap: break-word;
        }
        .message-assistant .message-content {
            background: #00cc88;
            color: #ffffff;
        }
        .message-content p {
            margin: 0;
        }
        h1 { font-size: 28px; margin-bottom: 20px; }
        h2 { font-size: 24px; }
        h3 { font-size: 20px; }
        h4 { font-size: 18px; }
        h5 { font-size: 16px; }
        h6 { font-size: 14px; }
        pre {
            position: relative;
            background: #f5f5f5;
            padding: 10px;
            border-radius: 8px;
            margin: 10px 0;
            overflow-x: auto;
            font-size: 14px;
        }
        code {
            background: #f5f5f5;
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 14px;
        }
        pre code {
            background: none;
            padding: 0;
        }
        .copy-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #e0e0e0;
            border: none;
            border-radius: 4px;
            padding: 5px;
            cursor: pointer;
            font-size: 14px;
        }
        .copy-btn:hover {
            background: #d0d0d0;
        }
        .footer {
            text-align: center;
            padding: 20px 0;
            font-size: 14px;
            color: #666;
        }
        .footer a {
            color: #0066cc;
            text-decoration: none;
        }
        .footer a:hover {
            text-decoration: underline;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 16px;
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
        tr:nth-child(even) {
            background: #fafafa;
        }
        tr:hover {
            background: #f0f0f0;
        }
        .MathJax_Display {
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="chat-container" id="content">${restoredHtml}</div>
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
                .replace(/\\\\\\]/g, "{{MATH_DISPLAY_END}}")
                .replace(/\\int\{([^}]*)\}\{([^}]*)\}/g, "\\int_{$2}^{$3}");
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

        updateContent();
    </script>
</body>
</html>`;
}
