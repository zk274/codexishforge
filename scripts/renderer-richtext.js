import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

for (const [name, language] of Object.entries({ bash, css, diff, javascript, json, markdown, python, shell, typescript, xml })) hljs.registerLanguage(name, language);
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["sh", "zsh"], { languageName: "bash" });

marked.setOptions({ gfm: true, breaks: true });

window.RichText = {
  render(markdownText) {
    const parsed = marked.parse(markdownText || "");
    return DOMPurify.sanitize(parsed, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["style", "srcset"],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^https:/i,
    });
  },
  highlight(root) {
    for (const block of root.querySelectorAll("pre code")) hljs.highlightElement(block);
  },
};
