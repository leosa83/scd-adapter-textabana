"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  BookOpen,
  Box,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Download,
  FileText,
  Layers3,
  Play,
  Plus,
  RadioTower,
  RotateCcw,
  Rows3,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Specification } from "./specification";

type ProjectFile = {
  path: string;
  kind: "document" | "module";
  content: string;
};

type FunctionMeta = {
  name: string;
  modulePath: string;
  description: string;
  args: Record<string, { type?: string; default?: unknown; description?: string }>;
  accepts: string;
  returns: string;
  outputs: string[];
};

type ChannelEvent = {
  schema: string;
  id: string;
  runId: number;
  documentVersion: string;
  sequence: number;
  channel: string;
  type: string;
  row: number;
  rowId: string;
  line: number;
  column?: number;
  endLine?: number;
  payload: unknown;
  source: { path: string; startLine: number; endLine: number; mapping: "exact" | "derived" | "synthetic" };
  origin: { function: string; module: string; modality: string; stageLine: number; scopeId?: string };
};

type RuntimeResult = {
  ok: boolean;
  output: string;
  error?: string;
  diagnostics: Array<{ level: string; line: number; message: string }>;
  channels: Record<string, ChannelEvent[]>;
  emissions: number;
  functions: FunctionMeta[];
  modulesLoaded: number;
  duration: number;
};

const sampleDocument = `>>>>! include "./modules/core.js"
>>>>! include "./modules/editorial.js"
>>>>! include "./modules/base64.js"
>>>>! include "./modules/metadata.js"
>>>>! config scope-order="declaration:asc"

>>>>+ normalize @id=clean @order=10
>>>>+ annotate label="Ärvd intervallfunktion" @id=provenance @order=30

# Semantisk körplan

Den här texten befinner sig direkt i båda öppna intervallen.

>>>> summarize sentences=2
Blocket körs först. Den här meningen ingår i blockets input. Därefter blir blockets output input till normalize och annotate. Den sista meningen tas bort av summarize.
<<<< summarize

>>>> uppercase @inherit=none
Det här blocket stänger av alla intervallfunktioner.
<<<< uppercase

>>>> heading text="Explicit kontroll" level=2 @inherit=explicit
  | @intervals only=[clean]
  | bullet
  | @intervals only=[provenance]

Blocket väljer själv vilka intervall som körs och var de placeras.
<<<< heading

Ett stycke kan bära lättviktiga properties.

{.claim priority=10 confidence=0.94}

<<<<+ @id=clean

Nu är bara annotate aktiv.

<<<<+ @id=provenance

## Samma text, flera outputkanaler

>>>>+ collect_rows channel="records" kind="claim" @id=metadata

Varje icke-tom rad kan bli en logisk metadatapost.
Editorn får både ett logiskt row-id och den fysiska källraden.

<<<<+ @id=metadata

## Base64 som intervallfunktion

>>>>+ base64encode @id=encoder

<base64encode> Textabana kan transformera den här texten </base64encode>

<<<<+ @id=encoder

>>>>+ base64decode @id=decoder

<base64decode>VGV4dGFiYW5hIGthbiB0cmFuc2Zvcm1lcmEgdGV4dA==</base64decode>

<<<<+ @id=decoder

## Base64 som nästlad intervallfunktion ger invers

>>>>+ base64encode @id=nested-encoder

>>>>+ base64decode @id=nested-decoder

<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>

<<<<+ @id=nested-encoder
<<<<+ @id=nested-decoder`;

const coreModule = `define({
  normalize: {
    description: "Normaliserar blanksteg utan att ändra Markdown-strukturen.",
    behavior: "segment-preserving",
    args: {},
    transform(input) {
      return String(input).replace(/[ \\t]+/g, " ");
    }
  },

  trim: {
    description: "Tar bort inledande och avslutande blanksteg.",
    args: {},
    transform(input) {
      return String(input).trim();
    }
  },

  uppercase: {
    description: "Gör all text till versaler.",
    behavior: "segment-preserving",
    args: {},
    transform(input) {
      return String(input).toUpperCase();
    }
  },

  replace: {
    description: "Ersätter text. Använd from och to.",
    args: {
      from: { type: "string", description: "Text att söka efter" },
      to: { type: "string", default: "", description: "Ersättningstext" }
    },
    transform(input, args) {
      return String(input).split(String(args.from ?? "")).join(String(args.to ?? ""));
    }
  },

  heading: {
    description: "Lägger till en Markdown-rubrik före resultatet.",
    args: {
      text: { type: "string", description: "Rubrikens text" },
      level: { type: "number", default: 2, description: "Rubriknivå 1–6" }
    },
    transform(input, args) {
      const level = Math.min(6, Math.max(1, Number(args.level ?? 2)));
      return "#".repeat(level) + " " + (args.text ?? "Resultat") + "\\n\\n" + String(input).trim() + "\\n";
    }
  },

  bullet: {
    description: "Gör varje icke-tom rad till en punkt i en lista.",
    args: {},
    transform(input) {
      return String(input)
        .split("\\n")
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => "- " + line)
        .join("\\n");
    }
  }
});`;

const editorialModule = `>>>>! include "./core.js"

define({
  select_sentences: {
    description: "Behåller meningar som innehåller ett visst ord eller uttryck.",
    args: {
      contains: { type: "string", description: "Text som meningen måste innehålla" },
      caseSensitive: { type: "boolean", default: false, description: "Skiftlägeskänslig sökning" }
    },
    transform(input, args) {
      const source = String(input).trim();
      const needle = String(args.contains ?? "");
      const sentences = source.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
      const matches = sentences.filter(sentence => {
        if (args.caseSensitive) return sentence.includes(needle);
        return sentence.toLowerCase().includes(needle.toLowerCase());
      });
      return matches.map(sentence => sentence.trim()).join("\\n");
    }
  },

  summarize: {
    description: "Behåller de första meningarna som en deterministisk kortversion.",
    behavior: "reducing",
    args: {
      sentences: { type: "number", default: 2, description: "Antal meningar" }
    },
    transform(input, args) {
      const count = Math.max(1, Number(args.sentences ?? 2));
      const sentences = String(input).match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
      return sentences.slice(0, count).map(sentence => sentence.trim()).join(" ");
    }
  },

  annotate: {
    description: "Omsluter resultatet med en märkt Markdown-notering.",
    behavior: "expanding",
    args: {
      label: { type: "string", default: "Notering", description: "Rutans etikett" }
    },
    transform(input, args) {
      return "> **" + (args.label ?? "Notering") + "**  \\n> " + String(input).trim().replace(/\\n/g, "\\n> ");
    }
  }
});`;

const metadataModule = `function rowKey(kind, text) {
  let hash = 2166136261;
  const source = kind + ":" + text;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return kind + ":" + (hash >>> 0).toString(36);
}

define({
  collect_rows: {
    description: "Behåller texten och publicerar varje icke-tom rad som strukturerad metadata.",
    behavior: "segment-preserving",
    outputs: ["render", "system.out", "records"],
    args: {
      channel: { type: "string", default: "records", description: "Valfri namngiven kanal" },
      kind: { type: "string", default: "row", description: "Metadatapostens typ" }
    },
    transform(input, args, context) {
      let row = 0;
      String(input).split("\\n").forEach((sourceLine, lineOffset) => {
        const text = sourceLine.trim();
        if (!text) return;
        row += 1;
        const kind = String(args.kind ?? "row");
        const rowId = rowKey(kind, text);
        const payload = { kind, text };
        const location = { row, rowId, lineOffset, type: "row" };

        context.system.out.row(rowId, payload, location);
        context.emit(String(args.channel ?? "records"), payload, location);
      });
      return input;
    }
  }
});`;

const base64Module = `function encodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeUtf8(value) {
  const binary = atob(value.replace(/\\s+/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

define({
  base64encode: {
    description: "Base64-kodar innehållet i <base64encode>...</base64encode>.",
    behavior: "segment-preserving",
    args: {},
    transform(input) {
      return String(input).replace(
        /<base64encode>([\\s\\S]*?)<\\/base64encode>/gi,
        (_match, text) => encodeUtf8(text.trim())
      );
    }
  },

  base64decode: {
    description: "Avkodar Base64 i <base64decode>...</base64decode> till UTF-8-text.",
    behavior: "segment-preserving",
    args: {},
    transform(input, _args, context) {
      return String(input).replace(
        /<base64decode>([\\s\\S]*?)<\\/base64decode>/gi,
        (_match, text) => {
          try {
            return decodeUtf8(text.trim());
          } catch {
            context.warn("Ogiltig Base64 lämnades oförändrad.");
            return _match;
          }
        }
      );
    }
  }
});`;

const initialFiles: ProjectFile[] = [
  { path: "document.md", kind: "document", content: sampleDocument },
  { path: "modules/core.js", kind: "module", content: coreModule },
  { path: "modules/editorial.js", kind: "module", content: editorialModule },
  { path: "modules/base64.js", kind: "module", content: base64Module },
  { path: "modules/metadata.js", kind: "module", content: metadataModule },
];

const storageKey = "textabana-project-v5";

function CodeEditor({ file, onChange }: { file: ProjectFile; onChange: (value: string) => void }) {
  const extensions = useMemo(
    () => [file.kind === "document" ? markdown() : javascript()],
    [file.kind],
  );

  return (
    <CodeMirror
      value={file.content}
      height="100%"
      theme="dark"
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        autocompletion: true,
      }}
      aria-label={`Redigera ${file.path}`}
    />
  );
}

function ChannelInspector({ name, events }: { name: string; events: ChannelEvent[] }) {
  return (
    <div className="channel-scroll">
      <div className="channel-intro">
        <div>
          <span className="channel-name">{name}</span>
          <strong>{events.length} {events.length === 1 ? "händelse" : "händelser"}</strong>
        </div>
        <p>{name === "system.out"
          ? "Kärnans positionsmedvetna metadataflöde för editorer."
          : "Append-only-output från funktionerna i aktuell körning."}</p>
      </div>
      <div className="channel-events">
        {events.map((event) => (
          <article className="channel-event" key={event.id}>
            <div className="channel-event-head">
              <span className="event-sequence">#{event.sequence}</span>
              <span className="event-position"><Rows3 /> row {event.row}</span>
              <span className="event-position">line {event.line}</span>
              <span className={`mapping-badge is-${event.source.mapping}`}>{event.source.mapping}</span>
              <code>{event.origin.function}</code>
            </div>
            <pre>{typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload, null, 2)}</pre>
            <div className="channel-event-foot">
              <span><strong>row-id</strong> {event.rowId}</span>
              <span><strong>source</strong> {event.source.path ?? "document.md"}:{event.source.startLine}{event.source.endLine !== event.source.startLine ? `–${event.source.endLine}` : ""}</span>
              <span><strong>origin</strong> {event.origin.modality}{event.origin.scopeId ? ` · ${event.origin.scopeId}` : ""}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Preview({ result, running }: { result: RuntimeResult; running: boolean }) {
  const [activeOutput, setActiveOutput] = useState("render");
  const channelNames = Object.keys(result.channels);
  const selectedOutput = activeOutput === "render" || Object.hasOwn(result.channels, activeOutput)
    ? activeOutput
    : "render";

  return (
    <section className="preview-shell" aria-label="Renderat resultat">
      <div className="panel-bar">
        <div className="panel-title">
          <RadioTower aria-hidden="true" />
          Outputs
        </div>
        <span className={`runtime-state ${result.ok ? "is-ok" : "is-error"}`}>
          <span />
          {running ? "Bearbetar" : result.ok ? "Synkroniserad" : "Fel"}
        </span>
      </div>

      {result.ok ? (
        <>
          <div className="output-tabs" role="tablist" aria-label="Outputkanaler">
            <button type="button" role="tab" aria-selected={selectedOutput === "render"} className={selectedOutput === "render" ? "is-active" : ""} onClick={() => setActiveOutput("render")}>
              <Sparkles /> Render
            </button>
            {channelNames.map((name) => (
              <button type="button" role="tab" aria-selected={selectedOutput === name} className={selectedOutput === name ? "is-active" : ""} onClick={() => setActiveOutput(name)} key={name}>
                {name === "system.out" ? <Rows3 /> : <RadioTower />}
                {name}
                <small>{result.channels[name].length}</small>
              </button>
            ))}
          </div>
          {selectedOutput === "render" ? (
            <div className="preview-scroll">
              <article className="rendered-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output}</ReactMarkdown>
              </article>
            </div>
          ) : (
            <ChannelInspector name={selectedOutput} events={result.channels[selectedOutput] ?? []} />
          )}
        </>
      ) : (
        <div className="error-state">
          <div className="error-icon"><AlertTriangle aria-hidden="true" /></div>
          <div>
            <p className="error-kicker">Körningen avbröts</p>
            <h3>{result.error}</h3>
            <p>Kontrollera markören, funktionsnamnet eller den inkluderade modulen.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [activePath, setActivePath] = useState("document.md");
  const [view, setView] = useState("docs");
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [workerReady, setWorkerReady] = useState(false);
  const [running, setRunning] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<RuntimeResult>({
    ok: true,
    output: "",
    diagnostics: [],
    channels: {},
    emissions: 0,
    functions: [],
    modulesLoaded: 0,
    duration: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];

  useEffect(() => {
    let storedFiles: ProjectFile[] | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ProjectFile[];
        if (Array.isArray(parsed) && parsed.some((file) => file.kind === "document")) storedFiles = parsed;
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    const hydrationTimer = window.setTimeout(() => {
      if (storedFiles) setFiles(storedFiles);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(files));
  }, [files, hydrated]);

  useEffect(() => {
    const worker = new Worker("/runtime-worker.js");
    workerRef.current = worker;
    worker.onmessage = (event) => {
      if (event.data.runId !== runIdRef.current) return;
      setResult((previous) => ({
        ok: event.data.ok,
        output: event.data.ok ? event.data.output : previous.output,
        error: event.data.error,
        diagnostics: event.data.diagnostics ?? [],
        channels: event.data.channels ?? {},
        emissions: event.data.emissions ?? 0,
        functions: event.data.functions ?? previous.functions,
        modulesLoaded: event.data.modulesLoaded ?? previous.modulesLoaded,
        duration: event.data.duration ?? 0,
      }));
      setRunning(false);
    };
    worker.onerror = () => {
      setResult((previous) => ({ ...previous, ok: false, error: "Körmotorn kunde inte starta." }));
      setRunning(false);
    };
    const readyTimer = window.setTimeout(() => setWorkerReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      worker.terminate();
    };
  }, []);

  const execute = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const documentFile = files.find((file) => file.kind === "document");
    if (!documentFile) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunning(true);
    worker.postMessage({
      runId,
      documentPath: documentFile.path,
      documentSource: documentFile.content,
      modules: files.filter((file) => file.kind === "module"),
    });
  }, [files]);

  useEffect(() => {
    if (!workerReady) return;
    const timer = window.setTimeout(execute, 260);
    return () => window.clearTimeout(timer);
  }, [execute, workerReady]);

  const updateActiveFile = (content: string) => {
    setFiles((current) => current.map((file) => file.path === activeFile.path ? { ...file, content } : file));
  };

  const addModule = () => {
    let index = 1;
    while (files.some((file) => file.path === `modules/custom-${index}.js`)) index += 1;
    const path = `modules/custom-${index}.js`;
    const newModule: ProjectFile = {
      path,
      kind: "module",
      content: `define({\n  my_function: {\n    description: "Beskriv vad funktionen gör.",\n    outputs: ["render", "my.channel"],\n    args: {},\n    transform(input, args, context) {\n      context.emit("my.channel", { message: "Metadata från funktionen" });\n      return String(input);\n    }\n  }\n});`,
    };
    setFiles((current) => current.map((file) => file.kind === "document"
      ? { ...file, content: `>>>> include "./${path}"\n${file.content}` }
      : file).concat(newModule));
    setActivePath(path);
    toast.success("Ny modul skapad och inkluderad");
  };

  const resetProject = () => {
    if (!window.confirm("Återställ exempeldokumentet och alla moduler?")) return;
    setFiles(initialFiles);
    setActivePath("document.md");
    toast.success("Projektet återställdes");
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(result.output);
    toast.success("Resultatet kopierades");
  };

  const downloadOutput = () => {
    const blob = new Blob([result.output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "textabana-output.md";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Markdown-filen laddades ner");
  };

  return (
    <TooltipProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true"><Braces /></div>
            <div><strong>Textabana</strong><span>Semantic text runtime</span></div>
          </div>

          <Tabs value={view} onValueChange={setView} className="top-tabs">
            <TabsList>
              <TabsTrigger value="docs"><BookOpen /> Specifikation</TabsTrigger>
              <TabsTrigger value="workspace"><Code2 /> Playground</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="top-actions">
            {view === "workspace" && (
              <>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={resetProject} aria-label="Återställ exempel"><RotateCcw /></Button></TooltipTrigger><TooltipContent>Återställ exempel</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={copyOutput} disabled={!result.ok} aria-label="Kopiera resultat"><Copy /></Button></TooltipTrigger><TooltipContent>Kopiera resultat</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={downloadOutput} disabled={!result.ok} aria-label="Ladda ner resultat"><Download /></Button></TooltipTrigger><TooltipContent>Ladda ner Markdown</TooltipContent></Tooltip>
                <Button size="sm" onClick={execute}><Play /> Kör</Button>
              </>
            )}
          </div>
        </header>

        {view === "workspace" ? (
          <main className="workspace">
            <aside className="file-rail">
              <div className="rail-heading"><span>Projekt</span><Button variant="ghost" size="icon-xs" onClick={addModule} aria-label="Skapa modul"><Plus /></Button></div>
              <div className="file-list">
                {files.map((file) => (
                  <button key={file.path} className={`file-item ${activePath === file.path ? "is-active" : ""}`} onClick={() => setActivePath(file.path)}>
                    {file.kind === "document" ? <FileText /> : <Box />}
                    <span>{file.path.split("/").at(-1)}</span>
                    {file.kind === "module" && <small>JS</small>}
                  </button>
                ))}
              </div>
              <div className="rail-status">
                <div><Layers3 /><span><strong>{result.modulesLoaded}</strong> moduler laddade</span></div>
                <div><CircleDot /><span><strong>{result.functions.length}</strong> funktioner</span></div>
                <div><RadioTower /><span><strong>{Object.keys(result.channels).length}</strong> kanaler · {result.emissions} events</span></div>
                <div><Zap /><span><strong>{Math.round(result.duration)}</strong> ms</span></div>
              </div>
            </aside>

            <div className="desktop-workspace">
              <ResizablePanelGroup orientation="horizontal">
                <ResizablePanel defaultSize="52%" minSize="32%">
                  <section className="editor-shell">
                    <div className="panel-bar">
                      <div className="panel-title">{activeFile.kind === "document" ? <FileText /> : <Box />}{activeFile.path}</div>
                      <span className="file-kind">{activeFile.kind === "document" ? "MARKDOWN + TEXTABANA" : "JAVASCRIPT MODULE"}</span>
                    </div>
                    <div className="editor-area"><CodeEditor file={activeFile} onChange={updateActiveFile} /></div>
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="48%" minSize="30%"><Preview result={result} running={running} /></ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="mobile-workspace">
              <div className="mobile-switch">
                <button className={mobilePane === "editor" ? "is-active" : ""} onClick={() => setMobilePane("editor")}>Källa</button>
                <button className={mobilePane === "preview" ? "is-active" : ""} onClick={() => setMobilePane("preview")}>Resultat</button>
              </div>
              {mobilePane === "editor" ? (
                <section className="editor-shell"><div className="panel-bar"><div className="panel-title">{activeFile.path}</div></div><div className="editor-area"><CodeEditor file={activeFile} onChange={updateActiveFile} /></div></section>
              ) : <Preview result={result} running={running} />}
            </div>
          </main>
        ) : <Specification functions={result.functions} />}

        <footer className="statusbar">
          <span><CheckCircle2 /> Language draft 0.3</span>
          <span className="syntax-hint"><code>return</code> render <ChevronRight /><code>emit</code> channels <ChevronRight /><code>system.out</code></span>
          <span>Positionsmedveten · Flerkanalig</span>
        </footer>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
