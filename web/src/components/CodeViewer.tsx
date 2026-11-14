import { useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-cmake";
import "prismjs/components/prism-makefile";
import "prismjs/components/prism-markdown";
import "./prism-theme.css";
import { cn } from "../lib/format";

const EXT_LANG: Record<string, string> = {
  ino: "cpp",
  pde: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  h: "cpp",
  c: "c",
  py: "python",
  rs: "rust",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bash: "bash",
  json: "json",
  cmake: "cmake",
  mk: "makefile",
  md: "markdown",
};

/** Guess a Prism language id from a file path, falling back to the firmware language. */
export function languageForPath(path: string, fallback?: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const lower = base.toLowerCase();
  if (lower === "cmakelists.txt") return "cmake";
  if (lower === "makefile" || lower === "gnumakefile") return "makefile";
  if (lower === "platformio.ini") return "ini";
  if (lower === "cargo.toml") return "toml";
  const ext = lower.includes(".") ? lower.split(".").pop()! : "";
  if (EXT_LANG[ext]) return EXT_LANG[ext];
  if (ext === "txt") return "none";
  return fallback && Prism.languages[fallback] ? fallback : "none";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(code: string, lang: string): string {
  const grammar = Prism.languages[lang];
  if (!grammar) return escapeHtml(code);
  try {
    return Prism.highlight(code, grammar, lang);
  } catch {
    return escapeHtml(code);
  }
}

export function CodeViewer({ code, language, className }: { code: string; language: string; className?: string }) {
  const html = useMemo(() => highlight(code, language), [code, language]);
  const lineCount = useMemo(() => {
    const n = code.split("\n").length;
    return code.endsWith("\n") ? n - 1 : n;
  }, [code]);
  const gutterWidth = `${Math.max(2, String(lineCount).length) + 2}ch`;

  return (
    <div className={cn("relative h-full min-h-0 overflow-auto bg-[#0d1016]", className)}>
      <div className="flex min-w-max">
        <div
          aria-hidden
          className="pf-gutter sticky left-0 z-[1] shrink-0 border-r border-line bg-[#0d1016] py-3 pr-3 text-right text-ink-faint/70 select-none"
          style={{ width: gutterWidth }}
        >
          {Array.from({ length: Math.max(1, lineCount) }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className={cn("pf-code m-0 py-3 pr-6 pl-4", `language-${language}`)}>
          <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  );
}
