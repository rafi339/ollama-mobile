import React, { useState, useMemo } from "react";
import { XMarkIcon, EyeIcon } from "@heroicons/react/24/outline";

interface CodePreviewProps {
  code: string;
  language: string;
}

function buildPreviewHtml(code: string, language: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  switch (language.toLowerCase()) {
    case "html":
      return code;
    case "css":
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${code}</style>
</head>
<body>
<div class="preview-box">CSS Preview</div>
</body>
</html>`;
    case "javascript":
    case "js":
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<div id="output"></div>
<script>
try {
  ${code}
} catch (e) {
  document.getElementById('output').textContent = 'Error: ' + e.message;
}
</script>
</body>
</html>`;
    default:
      return `<pre>${escaped}</pre>`;
  }
}

const PREVIEWABLE = new Set(["html", "css", "javascript", "js"]);

export function isPreviewable(language: string): boolean {
  return PREVIEWABLE.has(language.toLowerCase());
}

export const CodePreviewButton: React.FC<CodePreviewProps> = React.memo(
  ({ code, language }) => {
    const [isOpen, setIsOpen] = useState(false);
    const srcDoc = useMemo(
      () => buildPreviewHtml(code, language),
      [code, language],
    );

    return (
      <>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer px-3 py-2"
          title="Preview"
        >
          <EyeIcon className="h-4 w-4" />
          <span>Preview</span>
        </button>

        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="w-full max-w-3xl h-[80vh] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                  Preview
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer"
                  title="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                </button>
              </div>

              {/* Preview area */}
              <div className="flex-1 bg-white">
                <iframe
                  title="Code Preview"
                  srcDoc={srcDoc}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
);
