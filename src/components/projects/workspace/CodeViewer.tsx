"use client";

import { Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { clientOnly } from "@/lib/client-only";
import { type GeneratedProjectFile } from "@/lib/projects/generated-types";

const MonacoEditor = clientOnly(() => import("@/lib/monaco-editor"));

function getEditorLanguage(path = "") {
  if (path.endsWith(".tsx") || path.endsWith(".ts")) {
    return "typescript";
  }

  if (path.endsWith(".jsx") || path.endsWith(".js") || path.endsWith(".mjs")) {
    return "javascript";
  }

  if (path.endsWith(".css")) {
    return "css";
  }

  if (path.endsWith(".scss")) {
    return "scss";
  }

  if (path.endsWith(".less")) {
    return "less";
  }

  if (path.endsWith(".json")) {
    return "json";
  }

  if (path.endsWith(".html")) {
    return "html";
  }

  if (path.endsWith(".md")) {
    return "markdown";
  }

  if (path.endsWith(".svg") || path.endsWith(".xml")) {
    return "xml";
  }

  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return "yaml";
  }

  if (path.endsWith(".sh") || path.endsWith(".bash")) {
    return "shell";
  }

  if (path.endsWith(".sql")) {
    return "sql";
  }

  if (path.endsWith(".py")) {
    return "python";
  }

  if (path.endsWith(".env")) {
    return "ini";
  }

  return "plaintext";
}

const ZIP_ENCODER = new TextEncoder();
const ZIP_DOS_TIME = 0;
const ZIP_DOS_DATE = 33;
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

type FileTreeNode = {
  children: Map<string, FileTreeNode>;
  path: string;
  type: "directory" | "file";
};

function FileTree({
  files,
  onSelect,
  selectedPath,
}: {
  files: GeneratedProjectFile[];
  onSelect: (path: string) => void;
  selectedPath: string;
}) {
  const root = buildFileTree(files);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = useCallback((path: string) => {
    setExpanded((current) => ({ ...current, [path]: !current[path] }));
  }, []);

  if (!files.length) {
    return (
      <p className="px-spacing-4 py-spacing-3 text-sm text-surface-warm-white/50">
        Source belum tersedia.
      </p>
    );
  }

  return (
    <div className="select-none">
      {sortFileTreeEntries(root.children).map(([name, node]) => (
        <FileTreeItem
          key={node.path || name}
          name={name}
          node={node}
          onSelect={onSelect}
          selectedPath={selectedPath}
          expanded={expanded}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  name,
  node,
  onSelect,
  selectedPath,
  expanded,
  onToggle,
}: {
  name: string;
  node: FileTreeNode;
  onSelect: (path: string) => void;
  selectedPath: string;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
}) {
  if (node.type === "file") {
    const selected = node.path === selectedPath;

    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`block w-full truncate px-spacing-4 py-spacing-1.5 text-left text-sm transition ${selected ? "bg-surface-warm-white/12 text-surface-warm-white" : "text-surface-warm-white/62 hover:bg-surface-warm-white/7 hover:text-surface-warm-white"}`}
        title={node.path}
      >
        <span className="pl-spacing-6">{name}</span>
      </button>
    );
  }

  const isOpen = expanded[node.path] === true;
  const children = sortFileTreeEntries(node.children);

  return (
    <div key={node.path} className="group">
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full cursor-pointer items-center px-spacing-4 py-spacing-1.5 text-left text-sm font-medium text-surface-warm-white/72 hover:bg-surface-warm-white/7 hover:text-surface-warm-white"
      >
        <span
          className={`mr-spacing-2 inline-block text-surface-warm-white/38 transition-transform ${isOpen ? "rotate-90" : ""}`}
        >
          ›
        </span>
        {name}
      </button>
      {isOpen ? (
        <div className="ml-spacing-5 border-l border-surface-warm-white/8 pl-spacing-3">
          {children.map(([childName, child]) => (
            <FileTreeItem
              key={child.path || `${node.path}/${childName}`}
              name={childName}
              node={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function sortFileTreeEntries(children: Map<string, FileTreeNode>) {
  return Array.from(children.entries()).sort(
    ([nameA, nodeA], [nameB, nodeB]) => {
      if (nodeA.type !== nodeB.type) {
        return nodeA.type === "directory" ? -1 : 1;
      }

      return nameA.localeCompare(nameB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    },
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function createZipBlob(files: GeneratedProjectFile[]) {
  const localFileParts: Uint8Array[] = [];
  const centralDirectoryParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = ZIP_ENCODER.encode(file.path);
    const content = ZIP_ENCODER.encode(file.content);
    const crc = crc32(content);
    const localHeader = createZipHeader(0x04034b50, name, content, crc, offset);
    const centralHeader = createZipHeader(
      0x02014b50,
      name,
      content,
      crc,
      offset,
    );

    localFileParts.push(localHeader, content);
    centralDirectoryParts.push(centralHeader);
    offset += localHeader.length + content.length;
  }

  const centralDirectorySize = centralDirectoryParts.reduce(
    (size, part) => size + part.length,
    0,
  );
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, offset, true);

  return new Blob(
    [...localFileParts, ...centralDirectoryParts, end].map(toBlobPart),
    { type: "application/zip" },
  );
}

function toBlobPart(part: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(part.length);

  copy.set(part);
  return copy.buffer;
}

function createZipHeader(
  signature: number,
  name: Uint8Array,
  content: Uint8Array,
  crc: number,
  offset: number,
) {
  const isCentralDirectory = signature === 0x02014b50;
  const header = new Uint8Array(isCentralDirectory ? 46 : 30);
  const view = new DataView(header.buffer);

  view.setUint32(0, signature, true);

  if (isCentralDirectory) {
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(12, ZIP_DOS_TIME, true);
    view.setUint16(14, ZIP_DOS_DATE, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, content.length, true);
    view.setUint32(24, content.length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
  } else {
    view.setUint16(4, 20, true);
    view.setUint16(10, ZIP_DOS_TIME, true);
    view.setUint16(12, ZIP_DOS_DATE, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, content.length, true);
    view.setUint32(22, content.length, true);
    view.setUint16(26, name.length, true);
  }

  const fullHeader = new Uint8Array(header.length + name.length);
  fullHeader.set(header);
  fullHeader.set(name, header.length);

  return fullHeader;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildFileTree(files: GeneratedProjectFile[]) {
  const root: FileTreeNode = {
    children: new Map(),
    path: "",
    type: "directory",
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const type = index === parts.length - 1 ? "file" : "directory";
      const existing = current.children.get(part);

      if (existing) {
        current = existing;
        return;
      }

      const next: FileTreeNode = { children: new Map(), path, type };
      current.children.set(part, next);
      current = next;
    });
  }

  return root;
}

function EmptyCodeState({ buildStatus }: { buildStatus: string }) {
  void buildStatus;
  return (
    <div className="grid h-full min-h-0 place-items-center bg-[#f7f4ed] p-spacing-6 text-center text-[#1c1c1c] transition-colors duration-200 dark:bg-[#10100f] dark:text-surface-warm-white">
      <div className="max-w-sm rounded-[24px] border border-black/10 bg-[#fcfbf8] px-spacing-6 py-spacing-6 shadow-sm dark:border-surface-warm-white/10 dark:bg-[#181816] dark:shadow-none">
        <p className="text-sm font-semibold text-[#1c1c1c] dark:text-surface-warm-white">
          Belum ada kode
        </p>
        <p className="mt-spacing-2 text-sm leading-6 text-[#5f5f5d] dark:text-surface-warm-white/54">
          Kode website akan muncul otomatis saat website mulai dibuat.
        </p>
      </div>
    </div>
  );
}

export function CodeView({
  files,
  buildStatus,
  error,
  isLoading,
  isBuilding,
  onRetry,
}: {
  files: GeneratedProjectFile[];
  buildStatus: string;
  error: string | null;
  isLoading: boolean;
  isBuilding?: boolean;
  onRetry: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedFiles = useMemo(
    () =>
      [...files].sort((a, b) =>
        a.path.localeCompare(b.path, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [files],
  );
  const [selectedPath, setSelectedPath] = useState(sortedFiles[0]?.path || "");
  const selectedFile =
    sortedFiles.find((file) => file.path === selectedPath) ?? sortedFiles[0];

  useEffect(() => {
    if (!sortedFiles.length) {
      setSelectedPath("");
      return;
    }

    if (
      !selectedPath ||
      !sortedFiles.some((file) => file.path === selectedPath)
    ) {
      setSelectedPath(sortedFiles[0].path);
    }
  }, [selectedPath, sortedFiles]);

  const exportCurrentFile = useCallback(() => {
    if (!selectedFile) {
      return;
    }

    downloadBlob(
      new Blob([selectedFile.content], { type: "text/plain;charset=utf-8" }),
      selectedFile.path.split("/").at(-1) || "generated-file.txt",
    );
  }, [selectedFile]);

  const exportProjectZip = useCallback(() => {
    if (!sortedFiles.length) {
      return;
    }

    downloadBlob(
      createZipBlob(sortedFiles),
      `umkmcepat-generated-project-${new Date().toISOString().slice(0, 10)}.zip`,
    );
  }, [sortedFiles]);

  if (isBuilding) {
    return (
      <div
        role="status"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-spacing-4 bg-[#10100f] p-spacing-6 text-center text-surface-warm-white"
      >
        <Loader2 className="size-8 animate-spin text-surface-warm-white/70" />
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-surface-warm-white">
            Sedang meracik kode website...
          </p>
          <p className="mt-spacing-2 text-xs leading-5 text-surface-warm-white/54">
            Kode terbaru akan otomatis muncul begitu proses pembuatan website
            selesai.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || (!sortedFiles.length && buildStatus === "building")) {
    return (
      <div
        role="status"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-spacing-4 bg-[#10100f] p-spacing-6 text-center text-surface-warm-white"
      >
        <Loader2 className="size-8 animate-spin text-surface-warm-white/70" />
        <p className="text-sm text-surface-warm-white/64">
          Memuat kode website...
        </p>
      </div>
    );
  }

  if (!sortedFiles.length && error) {
    return (
      <div className="grid h-full min-h-0 place-items-center bg-[#10100f] p-spacing-6 text-center text-surface-warm-white">
        <div className="max-w-sm rounded-[24px] border border-[#ffb4a6]/25 bg-[#ffb4a6]/8 px-spacing-6 py-spacing-6">
          <p className="text-sm font-semibold">Kode belum bisa dimuat</p>
          <p className="mt-spacing-2 text-sm leading-6 text-surface-warm-white/64">
            {error}
          </p>
          <Button type="button" onClick={onRetry} className="mt-spacing-4">
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  if (!sortedFiles.length) {
    return <EmptyCodeState buildStatus={buildStatus} />;
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden border-t border-surface-warm-white/10 bg-[#10100f] text-surface-warm-white md:grid-cols-[280px_1fr] md:grid-rows-1">
      {/* Mobile: sticky file-dropdown strip */}
      <div className="flex items-center justify-between gap-spacing-2 border-b border-surface-warm-white/10 bg-[#111110] px-spacing-4 py-spacing-3 text-sm md:hidden">
        <label htmlFor="workspace-code-file-mobile" className="sr-only">
          File
        </label>
        <select
          id="workspace-code-file-mobile"
          value={selectedFile?.path || ""}
          onChange={(event) => setSelectedPath(event.target.value)}
          className="min-w-0 flex-1 rounded-radius-md border border-surface-warm-white/12 bg-[#1d1d1a] px-spacing-3 py-spacing-2 text-sm text-surface-warm-white outline-none focus:border-surface-warm-white/30"
        >
          {sortedFiles.map((file) => (
            <option key={file.path} value={file.path}>
              {file.path}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: existing sidebar */}
      <aside className="hidden overflow-y-auto border-r border-surface-warm-white/10 bg-[#181816] py-spacing-3 md:block">
        <div className="border-b border-surface-warm-white/8 px-spacing-4 pb-spacing-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-surface-warm-white/34">
            Explorer
          </p>
          <p className="mt-spacing-2 text-xs text-surface-warm-white/44">
            Build: {buildStatus}
          </p>
          {error ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-spacing-2 text-left text-xs leading-5 text-[#ffb4a6] underline underline-offset-4"
            >
              Kode lama tetap ditampilkan. Coba muat ulang.
            </button>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={exportProjectZip}
            disabled={!sortedFiles.length}
            className="mt-spacing-3 h-8 w-full justify-start rounded-radius-md bg-surface-warm-white text-xs text-foreground-primary hover:bg-surface-warm-white/90"
          >
            Export semua (.zip)
          </Button>
        </div>
        <div className="py-spacing-3 text-sm">
          <FileTree
            files={sortedFiles}
            selectedPath={selectedFile?.path || ""}
            onSelect={setSelectedPath}
          />
        </div>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between gap-spacing-4 border-b border-surface-warm-white/10 bg-[#111110] px-spacing-5 py-spacing-3 text-sm text-surface-warm-white/58">
          <span
            className="min-w-0 truncate"
            title={selectedFile?.path || undefined}
          >
            {selectedFile?.path || "Belum ada file"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCurrentFile}
            disabled={!selectedFile}
            className="h-8 shrink-0 rounded-radius-md border-surface-warm-white/14 bg-transparent text-xs text-surface-warm-white hover:bg-surface-warm-white/8"
          >
            Export file ini
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MonacoEditor
            height="100%"
            language={getEditorLanguage(selectedFile?.path)}
            value={selectedFile?.content || ""}
            theme={mounted && !isDark ? "vs" : "vs-dark"}
            loading={
              <div
                role="status"
                className="flex h-full min-h-0 items-center justify-center gap-spacing-3 bg-black/5 text-sm text-[#5f5f5d] dark:bg-[#10100f] dark:text-surface-warm-white/64"
              >
                <div className="size-5 animate-spin rounded-full border-2 border-black/10 border-t-black/60 dark:border-surface-warm-white/12 dark:border-t-surface-warm-white/82" />
                Memuat editor kode...
              </div>
            }
            options={{
              readOnly: true,
              domReadOnly: true,
              editContext: false,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 22,
              padding: { top: 16, bottom: 16 },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              contextmenu: false,
              glyphMargin: false,
              folding: true,
              links: false,
              overviewRulerLanes: 0,
              renderLineHighlight: "line",
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
