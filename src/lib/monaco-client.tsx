import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Bundle Monaco locally instead of fetching it from the jsdelivr CDN at
// runtime (the loader's default). The full package ships every language
// basic-languages/ needs (ts, js, css, html, json, markdown, ...), so all
// extensions the scaffold engine can emit are covered with no CDN dependency.
loader.config({ monaco });

// Read-only code viewer. Vite-bundled per-language workers keep syntax
// highlighting snappy; `new URL` lets Vite emit + hash each worker chunk.
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === "json") {
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/language/json/json.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/language/css/css.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/language/html/html.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    }
    if (label === "typescript" || label === "javascript") {
      return new Worker(
        new URL(
          "monaco-editor/esm/vs/language/typescript/ts.worker.js",
          import.meta.url,
        ),
        { type: "module" },
      );
    }
    return new Worker(
      new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      { type: "module" },
    );
  },
};
