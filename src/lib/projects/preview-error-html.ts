export function createPreviewIssueHtml({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #10100f;
        color: #fcfbf8;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #10100f;
      }
      main {
        width: min(92vw, 34rem);
        box-sizing: border-box;
        border: 1px solid rgba(255, 180, 166, 0.2);
        border-radius: 24px;
        background: #241d1a;
        padding: 32px;
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.4rem, 4vw, 2rem);
        line-height: 1.1;
      }
      p {
        margin: 14px auto 0;
        max-width: 26rem;
        color: rgba(252, 251, 248, 0.68);
        font-size: 0.95rem;
        line-height: 1.7;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
