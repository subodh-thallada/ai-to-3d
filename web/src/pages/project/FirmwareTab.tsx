import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Download, FileCode, FileText, Folder, FolderOpen, Package } from "lucide-react";
import type { FirmwareFile, FirmwareSpec } from "@protoforge/shared";
import { CodeViewer, languageForPath } from "../../components/CodeViewer";
import { Badge, Button, Card, EmptyState, SectionTitle } from "../../components/ui";
import { copyText, downloadBlob, downloadText, slugify } from "../../lib/download";
import { cn, fmtNum } from "../../lib/format";
import { buildZip } from "../../lib/zip";

interface DirNode {
  name: string;
  path: string;
  dirs: DirNode[];
  files: FirmwareFile[];
}

function buildTree(files: FirmwareFile[]): DirNode {
  const root: DirNode = { name: "", path: "", dirs: [], files: [] };
  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").replace(/^\.?\//, "").split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      let next = node.dirs.find((d) => d.path === dirPath);
      if (!next) {
        next = { name: parts[i], path: dirPath, dirs: [], files: [] };
        node.dirs.push(next);
      }
      node = next;
    }
    node.files.push(f);
  }
  const sort = (n: DirNode) => {
    n.dirs.sort((a, b) => a.name.localeCompare(b.name));
    n.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function TreeDir({ node, depth, selected, onSelect }: { node: DirNode; depth: number; selected: string; onSelect: (p: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded py-[3px] pr-2 text-left text-[12px] text-ink-dim outline-none hover:bg-panel-2 focus-visible:ring-1 focus-visible:ring-accent"
        style={{ paddingLeft: 6 + depth * 12 }}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} className="shrink-0 text-ink-faint" /> : <ChevronRight size={12} className="shrink-0 text-ink-faint" />}
        {open ? <FolderOpen size={13} className="shrink-0 text-ink-faint" /> : <Folder size={13} className="shrink-0 text-ink-faint" />}
        <span className="truncate">{node.name}</span>
      </button>
      {open && <TreeChildren node={node} depth={depth + 1} selected={selected} onSelect={onSelect} />}
    </li>
  );
}

function TreeChildren({ node, depth, selected, onSelect }: { node: DirNode; depth: number; selected: string; onSelect: (p: string) => void }) {
  return (
    <ul>
      {node.dirs.map((d) => (
        <TreeDir key={d.path} node={d} depth={depth} selected={selected} onSelect={onSelect} />
      ))}
      {node.files.map((f) => {
        const isSel = f.path === selected;
        const isCode = languageForPath(f.path) !== "none" && !/\.(md|txt)$/i.test(f.path);
        return (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onSelect(f.path)}
              title={f.description || f.path}
              className={cn(
                "flex w-full items-center gap-1.5 rounded py-[3px] pr-2 text-left text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-accent",
                isSel ? "bg-accent/12 text-ink" : "text-ink-dim hover:bg-panel-2 hover:text-ink",
              )}
              style={{ paddingLeft: 6 + depth * 12 + 13 }}
            >
              {isCode ? <FileCode size={13} className={cn("shrink-0", isSel ? "text-accent" : "text-ink-faint")} /> : <FileText size={13} className="shrink-0 text-ink-faint" />}
              <span className="truncate font-mono text-[11.5px]">{baseName(f.path)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FirmwareTab({ firmware, productName }: { firmware: FirmwareSpec; productName: string }) {
  const files = useMemo(() => (firmware.files ?? []).filter((f) => f && typeof f.path === "string"), [firmware.files]);
  const tree = useMemo(() => buildTree(files), [files]);
  const [selected, setSelected] = useState<string>(() => files[0]?.path ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!files.some((f) => f.path === selected)) setSelected(files[0]?.path ?? "");
  }, [files, selected]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const file = files.find((f) => f.path === selected);
  const lang = file ? languageForPath(file.path, firmware.language) : "none";
  const totalLines = files.reduce((s, f) => s + (f.content ? f.content.split("\n").length : 0), 0);
  const slug = slugify(productName);

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{firmware.platform}</Badge>
        <Badge tone="cyan">{firmware.language}</Badge>
        <Badge>Target · {firmware.target}</Badge>
        <span className="text-[11.5px] text-ink-faint">
          {fmtNum(files.length)} files · {fmtNum(totalLines)} lines
        </span>
        <Button className="ml-auto" disabled={files.length === 0} onClick={() => downloadBlob(buildZip(files), `${slug}-firmware.zip`)}>
          <Package size={13} /> Download all (.zip)
        </Button>
      </div>

      <Card className="grid h-[min(68vh,680px)] min-h-[360px] grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
        <nav className="min-h-0 overflow-y-auto border-r border-line bg-panel py-2 pl-1" aria-label="Firmware files">
          {files.length === 0 ? <div className="px-3 py-2 text-[12px] text-ink-faint">No files.</div> : <TreeChildren node={tree} depth={0} selected={selected} onSelect={setSelected} />}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-col">
          {file ? (
            <>
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
                <span className="truncate font-mono text-[12px] text-ink">{file.path}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">
                  {lang} · {fmtNum(file.content.split("\n").length)} lines
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (await copyText(file.content)) setCopied(true);
                    }}
                    aria-label="Copy file contents"
                  >
                    {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="ghost" onClick={() => downloadText(file.content, baseName(file.path))} aria-label="Download file">
                    <Download size={13} /> Download
                  </Button>
                </div>
              </div>
              {file.description && <div className="shrink-0 border-b border-line bg-panel-2/60 px-3 py-1.5 text-[11.5px] text-ink-dim">{file.description}</div>}
              <CodeViewer code={file.content ?? ""} language={lang} className="flex-1" />
            </>
          ) : (
            <EmptyState title="No file selected">Pick a file from the tree.</EmptyState>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <SectionTitle>Build &amp; flash</SectionTitle>
          <Card className="p-3">
            {firmware.build?.length ? (
              <ol className="space-y-2">
                {firmware.build.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-ink-dim">
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-[10px] text-ink">{i + 1}</span>
                    <span className="min-w-0 break-words">{s}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-[12px] text-ink-faint">No build steps provided.</div>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Libraries</SectionTitle>
          <Card className="overflow-hidden">
            {firmware.libraries?.length ? (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-[11px] text-ink-faint">
                    <th className="px-3 py-1.5 font-medium">Library</th>
                    <th className="px-3 py-1.5 font-medium">Version</th>
                    <th className="px-3 py-1.5 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {firmware.libraries.map((l, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink">{l.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-ink-dim">{l.version || "latest"}</td>
                      <td className="px-3 py-1.5 text-ink-dim">{l.purpose || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-[12px] text-ink-faint">No external libraries.</div>
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>Pin map</SectionTitle>
          <Card className="overflow-hidden">
            {firmware.pinMap?.length ? (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-panel-2 text-left text-[11px] text-ink-faint">
                    <th className="px-3 py-1.5 font-medium">Pin</th>
                    <th className="px-3 py-1.5 font-medium">Component</th>
                    <th className="px-3 py-1.5 font-medium">Function</th>
                  </tr>
                </thead>
                <tbody>
                  {firmware.pinMap.map((p, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-accent">{p.pin}</td>
                      <td className="px-3 py-1.5 text-ink">{p.component}</td>
                      <td className="px-3 py-1.5 text-ink-dim">{p.function}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-[12px] text-ink-faint">No pin assignments.</div>
            )}
          </Card>
        </div>
        {firmware.notes && firmware.notes.length > 0 && (
          <div>
            <SectionTitle>Notes</SectionTitle>
            <Card className="p-3">
              <ul className="space-y-1.5">
                {firmware.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-ink-dim">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
