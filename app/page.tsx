"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import {
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
  GitBranch,
  Layers3,
  PanelRight,
  Play,
  Plus,
  RadioTower,
  RotateCcw,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Specification } from "./specification";
import { PlaygroundOutput } from "./playground-labs";
import type { LabId, PlaygroundFixture, ProjectFile, RuntimeResult } from "./playground-model";

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

const editorFixtureDocument = `>>>>! include "./modules/metadata.js"

# Editorrevision

Flytta en rad, infoga text eller ändra ordningen. Logiska row-id:n följer oförändrad text medan line förblir en fysisk projektion.

>>>>+ collect_rows channel="records" kind="claim" @id=claims @order=10

Fartyget Aurora avgick från Göteborg den 4 maj.
Lasten uppgavs innehålla silver och navigationsinstrument.
Den sista dokumenterade positionen behöver verifieras.

<<<<+ @id=claims`;

const channelFixtureDocument = `>>>>! include "./modules/metadata.js"

# En källa, flera outputs

>>>> collect_rows channel="records" kind="observation"
Aurora lämnade Göteborg den 4 maj.
Manifestet nämner silverlast.
Positionen är en granskningskandidat.
<<<< collect_rows

Render fortsätter som vanlig Markdown. Metadata publiceras separat till records, metrics och system.out.`;

const base64FixtureDocument = `>>>>! include "./modules/base64.js"

# Base64 som nästlad intervallfunktion ger invers

>>>>+ base64encode @id=encoder
>>>>+ base64decode @id=decoder

<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>

<<<<+ @id=encoder
<<<<+ @id=decoder`;

const failedRunFixtureDocument = `>>>>! include "./modules/metadata.js"

# Atomiskt schemafel

>>>> collect_rows channel="undeclared.audit" kind="claim"
Den här posten emitteras till en kanal utan deklarerad descriptor.
<<<< collect_rows

I strict channel mode ska körningen misslyckas utan committed render eller domänkanaler.`;

const playgroundFixtures: PlaygroundFixture[] = [
  {
    id: "scope-torture",
    title: "Scope torture",
    summary: "Block, öppna intervall, order, inheritance, kanaler och Base64 i samma run.",
    document: sampleDocument,
  },
  {
    id: "editor-revision",
    title: "Editor revision",
    summary: "Flytta text och se skillnaden mellan stabil row-identitet och fysisk line.",
    document: editorFixtureDocument,
  },
  {
    id: "channel-fanout",
    title: "Channel fan-out",
    summary: "Ett funktionsanrop producerar render, system.out, records och metrics.",
    document: channelFixtureDocument,
  },
  {
    id: "base64-inverse",
    title: "Base64 inverse",
    summary: "Två öppna intervall komponerar encode och decode till en invers.",
    document: base64FixtureDocument,
  },
  {
    id: "failed-run",
    title: "Failed run",
    summary: "En odeklarerad kanal visar strict validation och atomisk rollback.",
    document: failedRunFixtureDocument,
  },
];

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
    outputs: ["render", "system.out", "records", "metrics"],
    channels: {
      records: {
        payloadKind: "object",
        mediaType: "application/json",
        schemaRef: "schema:textabana/record/v1",
        delivery: "snapshot",
        persistence: "durable",
        ordering: "global-sequence",
        key: ["payload.rowId"],
        schema: {
          type: "object",
          required: ["kind", "text"],
          properties: { kind: { type: "string" }, text: { type: "string" } }
        }
      },
      metrics: {
        payloadKind: "object",
        mediaType: "application/json",
        schemaRef: "schema:textabana/metric/v1",
        delivery: "snapshot",
        persistence: "durable",
        ordering: "global-sequence",
        schema: {
          type: "object",
          required: ["kind", "total", "channel"],
          properties: { kind: { type: "string" }, total: { type: "integer" }, channel: { type: "string" } }
        }
      }
    },
    args: {
      channel: { type: "string", default: "records", description: "Valfri namngiven kanal" },
      kind: { type: "string", default: "row", description: "Metadatapostens typ" }
    },
    transform(input, args, context) {
      let row = 0;
      const channel = String(args.channel ?? "records");
      const kind = String(args.kind ?? "row");
      String(input).split("\\n").forEach((sourceLine, lineOffset) => {
        const text = sourceLine.trim();
        if (!text) return;
        row += 1;
        const rowId = rowKey(kind, text);
        const payload = { kind, text, rowId };
        const location = { row, rowId, rowSet: kind + "s", lineOffset, kind: "annotation" };

        context.system.out.row(rowId, payload, location);
        context.system.out.line({ kind: "line-projection", rowId, text }, { ...location, kind: "annotation" });
        context.emit(channel, payload, location);
      });
      context.emit("metrics", { kind: "row-count", total: row, channel }, { row: 1, lineOffset: 0, kind: "metric", mapping: "derived" });
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

const storageKey = "textabana-project-v6-labs";

function filesForFixture(fixtureId: string): ProjectFile[] {
  const fixture = playgroundFixtures.find((item) => item.id === fixtureId) ?? playgroundFixtures[0];
  return initialFiles.map((file) => file.kind === "document" ? { ...file, content: fixture.document } : { ...file });
}

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

const emptyRuntimeResult: RuntimeResult = {
  runId: 0,
  ok: true,
  output: "",
  diagnostics: [],
  channels: {},
  channelDescriptors: {},
  anchors: [],
  sourceMaps: [],
  inspection: null,
  plan: null,
  executionTrace: [],
  resultEnvelope: null,
  capabilities: null,
  emissions: 0,
  functions: [],
  modulesLoaded: 0,
  duration: 0,
};

export default function Home() {
  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const [activePath, setActivePath] = useState("document.md");
  const [view, setView] = useState("workspace");
  const [lab, setLab] = useState<LabId>("language");
  const [fixtureId, setFixtureId] = useState(playgroundFixtures[0].id);
  const [strictChannels, setStrictChannels] = useState(true);
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [workerReady, setWorkerReady] = useState(false);
  const [running, setRunning] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<RuntimeResult>(emptyRuntimeResult);
  const [previousResult, setPreviousResult] = useState<RuntimeResult | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const lastResultRef = useRef<RuntimeResult | null>(null);
  const activeFile = files.find((file) => file.path === activePath) ?? files[0];

  useEffect(() => {
    let storedState: { files: ProjectFile[]; fixtureId?: string; strictChannels?: boolean } | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as { files?: ProjectFile[]; fixtureId?: string; strictChannels?: boolean };
        if (Array.isArray(parsed.files) && parsed.files.some((file) => file.kind === "document")) {
          storedState = { files: parsed.files, fixtureId: parsed.fixtureId, strictChannels: parsed.strictChannels };
        }
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    const hydrationTimer = window.setTimeout(() => {
      if (storedState) {
        setFiles(storedState.files);
        if (storedState.fixtureId && playgroundFixtures.some((fixture) => fixture.id === storedState?.fixtureId)) setFixtureId(storedState.fixtureId);
        if (typeof storedState.strictChannels === "boolean") setStrictChannels(storedState.strictChannels);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ files, fixtureId, strictChannels }));
  }, [files, fixtureId, hydrated, strictChannels]);

  useEffect(() => {
    const worker = new Worker("/runtime-worker.js");
    workerRef.current = worker;
    worker.onmessage = (event) => {
      if (event.data.runId !== runIdRef.current) return;
      const nextResult: RuntimeResult = {
        runId: event.data.runId,
        ok: event.data.ok,
        output: event.data.output ?? "",
        error: event.data.error,
        diagnostics: event.data.diagnostics ?? [],
        channels: event.data.channels ?? {},
        channelDescriptors: event.data.channelDescriptors ?? {},
        anchors: event.data.anchors ?? [],
        sourceMaps: event.data.sourceMaps ?? [],
        inspection: event.data.inspection ?? null,
        plan: event.data.plan ?? null,
        executionTrace: event.data.executionTrace ?? [],
        resultEnvelope: event.data.resultEnvelope ?? null,
        capabilities: event.data.capabilities ?? null,
        emissions: event.data.emissions ?? 0,
        functions: event.data.functions ?? [],
        modulesLoaded: event.data.modulesLoaded ?? 0,
        duration: event.data.duration ?? 0,
      };
      setPreviousResult(lastResultRef.current);
      lastResultRef.current = nextResult;
      setResult(nextResult);
      setRunning(false);
    };
    worker.onerror = () => {
      const failed = { ...emptyRuntimeResult, runId: runIdRef.current, ok: false, error: "Körmotorn kunde inte starta." };
      setPreviousResult(lastResultRef.current);
      lastResultRef.current = failed;
      setResult(failed);
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
      options: { strictChannels },
    });
  }, [files, strictChannels]);

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
      content: `define({\n  my_function: {\n    description: "Beskriv vad funktionen gör.",\n    outputs: ["render", "my.channel"],\n    channels: {\n      "my.channel": {\n        payloadKind: "object",\n        mediaType: "application/json",\n        schemaRef: "schema:my-channel/v1",\n        delivery: "snapshot",\n        persistence: "durable",\n        ordering: "global-sequence",\n        schema: { type: "object", required: ["message"] }\n      }\n    },\n    args: {},\n    transform(input, args, context) {\n      context.emit("my.channel", { message: "Metadata från funktionen" });\n      return String(input);\n    }\n  }\n});`,
    };
    setFiles((current) => current.map((file) => file.kind === "document"
      ? { ...file, content: `>>>> include "./${path}"\n${file.content}` }
      : file).concat(newModule));
    setActivePath(path);
    toast.success("Ny modul skapad och inkluderad");
  };

  const selectFixture = (nextFixtureId: string) => {
    setFixtureId(nextFixtureId);
    setFiles(filesForFixture(nextFixtureId));
    setActivePath("document.md");
    setPreviousResult(null);
    lastResultRef.current = null;
    toast.success(`Fixture laddad: ${playgroundFixtures.find((fixture) => fixture.id === nextFixtureId)?.title ?? nextFixtureId}`);
  };

  const resetProject = () => {
    if (!window.confirm("Återställ aktuell fixture och alla moduler?")) return;
    setFiles(filesForFixture(fixtureId));
    setActivePath("document.md");
    setPreviousResult(null);
    lastResultRef.current = null;
    toast.success("Aktuell fixture återställdes");
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
              <TabsTrigger value="docs"><BookOpen /> Specifikation 0.4</TabsTrigger>
              <TabsTrigger value="workspace"><Code2 /> Playground Labs</TabsTrigger>
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
            <div className="lab-toolbar">
              <div className="lab-switcher" role="tablist" aria-label="Välj playground">
                <button type="button" role="tab" aria-selected={lab === "language"} className={lab === "language" ? "is-active" : ""} onClick={() => setLab("language")}>
                  <GitBranch /><span><strong>Language & Scope</strong><small>Vad körs, i vilken ordning och varför?</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "editor"} className={lab === "editor" ? "is-active" : ""} onClick={() => setLab("editor")}>
                  <PanelRight /><span><strong>Editor Metadata</strong><small>Anchors, row, line och SourceMap</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "channels"} className={lab === "channels" ? "is-active" : ""} onClick={() => setLab("channels")}>
                  <RadioTower /><span><strong>Channel & Result</strong><small>Descriptors, timeline och atomiskt resultat</small></span>
                </button>
              </div>
              <div className="lab-controls">
                <span className="shared-run-id"><CircleDot /> {running ? "running" : `run ${result.runId ?? "–"}`}</span>
                <label className="fixture-control">
                  <span>Fixture</span>
                  <Select value={fixtureId} onValueChange={selectFixture}>
                    <SelectTrigger size="sm" aria-label="Välj fixture"><SelectValue /></SelectTrigger>
                    <SelectContent align="end">
                      {playgroundFixtures.map((fixture) => <SelectItem value={fixture.id} key={fixture.id}>{fixture.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="strict-control">
                  <Switch size="sm" checked={strictChannels} onCheckedChange={setStrictChannels} aria-label="Strict channel mode" />
                  <span>Strict channels</span>
                </label>
              </div>
            </div>
            <aside className="file-rail">
              <div className="fixture-summary">
                <span>{playgroundFixtures.find((fixture) => fixture.id === fixtureId)?.title}</span>
                <p>{playgroundFixtures.find((fixture) => fixture.id === fixtureId)?.summary}</p>
              </div>
              <div className="rail-heading"><span>Delad källa</span><Button variant="ghost" size="icon-xs" onClick={addModule} aria-label="Skapa modul"><Plus /></Button></div>
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
                <ResizablePanel defaultSize="50%" minSize="32%">
                  <section className="editor-shell">
                    <div className="panel-bar">
                      <div className="panel-title">{activeFile.kind === "document" ? <FileText /> : <Box />}{activeFile.path}</div>
                      <span className="file-kind">{activeFile.kind === "document" ? "MARKDOWN + TEXTABANA" : "JAVASCRIPT MODULE"}</span>
                    </div>
                    <div className="editor-area"><CodeEditor file={activeFile} onChange={updateActiveFile} /></div>
                  </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize="50%" minSize="30%"><PlaygroundOutput lab={lab} result={result} previousResult={previousResult} running={running} onOpenLab={setLab} /></ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="mobile-workspace">
              <div className="mobile-switch">
                <button className={mobilePane === "editor" ? "is-active" : ""} onClick={() => setMobilePane("editor")}>Källa</button>
                <button className={mobilePane === "preview" ? "is-active" : ""} onClick={() => setMobilePane("preview")}>Resultat</button>
              </div>
              {mobilePane === "editor" ? (
                <section className="editor-shell"><div className="panel-bar"><div className="panel-title">{activeFile.path}</div></div><div className="editor-area"><CodeEditor file={activeFile} onChange={updateActiveFile} /></div></section>
              ) : <PlaygroundOutput lab={lab} result={result} previousResult={previousResult} running={running} onOpenLab={setLab} />}
            </div>
          </main>
        ) : <Specification />}

        <footer className="statusbar">
          <span><CheckCircle2 /> Interop draft 0.4 · Playground subset 0.4</span>
          <span className="syntax-hint"><code>source</code> IR <ChevronRight /><code>run</code> result <ChevronRight /><code>adapters</code></span>
          <span>Source-first · Typed · Positionsmedveten</span>
        </footer>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
