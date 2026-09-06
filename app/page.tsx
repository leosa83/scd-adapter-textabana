"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import {
  BookOpen,
  Bot,
  Box,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Database,
  Download,
  FileText,
  GitBranch,
  Layers3,
  NotebookTabs,
  PanelRight,
  PanelsTopLeft,
  Play,
  Plus,
  RadioTower,
  RotateCcw,
  ShieldCheck,
  Square,
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

const editorKernelFixtureDocument = `>>>>! include "./modules/metadata.js"

# Editor Kernel revisions

Varje block har en uttrycklig domänidentitet. Flytta ett block, ändra dess text eller lägg till ett nytt och följ det committade metadatadeltat.

>>>> collect_row row_id="claim:aurora" channel="records" kind="claim"
Fartyget Aurora avgick från Göteborg den 4 maj.
<<<< collect_row

>>>> collect_row row_id="claim:cargo" channel="records" kind="claim"
Lasten uppgavs innehålla silver.
<<<< collect_row

>>>> collect_row row_id="claim:position" channel="records" kind="claim"
Den sista dokumenterade positionen behöver verifieras.
<<<< collect_row`;

const stageCacheFixtureDocument = `>>>>! include "./modules/cache.js"

# Verifierad stage-cache

Ändra ”Göteborg” i den högra grenen, vänta på auto-run och klicka sedan Kör en gång. Två lika observationer i skilda committed revisioner verifierar den orörda vänstra grenen; den manuella körningen kan materialisera dess output utan ett nytt transformanrop.

>>>> cache_branch branch="left"
Aurora
<<<< cache_branch

>>>> cache_branch branch="right"
Göteborg
<<<< cache_branch`;

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

const dataJoinFixtureDocument = `>>>>! include "./modules/data.js"

# Data & Lineage

>>>> relational_join left="ships" right="manifests" on="ship_id" as="voyage_cargo"
### ships
| ship_id | ship | last_port |
| --- | --- | --- |
| ship:aurora | Aurora | Göteborg |
| ship:isabela | Isabela | Guayaquil |

### manifests
| ship_id | cargo | estimated_value_usd |
| --- | --- | ---: |
| ship:aurora | silver | 120000 |
| ship:isabela | instruments | 45000 |
<<<< relational_join`;

const notebookFixtureDocument = `>>>>! include "./modules/notebook.js"

# Notebook snapshot

>>>> notebook_snapshot profile="fresh" notebook_id="voyage-analysis"
## Cell: Source overview {#cell-source owner="research"}
Aurora lämnade Göteborg den 4 maj.

## Cell: Route summary {#cell-route audience="operations"}
**Sista kända rutt:** Göteborg → Guayaquil.

## Cell: Confidence {#cell-confidence kind="metric"}
{"confidence": 0.82, "status": "candidate"}
<<<< notebook_snapshot`;

const annotationReviewFixtureDocument = `>>>>! include "./modules/annotation.js"

# Annotation & AI Review

>>>> annotation_review set_id="voyage-review" reviewer="leo"
## Annotation: Route {#ann-route origin="ai" model="textabana-lab-extractor" model_version="1.0" prompt_id="route-v1" confidence=0.82 confidence_method="model-reported" decision="accept"}
Aurora lämnade Göteborg den 4 maj.

## Annotation: Cargo {#ann-cargo origin="ai" model="textabana-lab-extractor" model_version="1.0" prompt_id="cargo-v1" confidence=0.64 confidence_method="calibrated-score" decision="reject"}
Manifestet uppgav silverlast.

## Annotation: Status candidate {#ann-status origin="ai" model="textabana-lab-extractor" model_version="1.0" prompt_id="status-v1" confidence=0.73 confidence_method="model-reported" decision="supersede" superseded_by="ann-status-reviewed"}
Positionen är en granskningskandidat.

## Annotation: Status reviewed {#ann-status-reviewed origin="human" supersedes="ann-status"}
Positionen kräver extern verifiering.
<<<< annotation_review`;

const conformanceGoldenFixtureDocument = `>>>>! include "./modules/conformance.js"

# Conformance golden

>>>> conformance_probe suite="core-chain"
Alpha är den första positionsbundna observationen.
Beta är den andra positionsbundna observationen.
<<<< conformance_probe`;

const negativeUnknownFunctionFixtureDocument = `# Negativ fixture: okänd funktion

>>>> missing_transform
Den här texten får aldrig committas.
<<<< missing_transform`;

const negativeUnclosedBlockFixtureDocument = `>>>>! include "./modules/core.js"

# Negativ fixture: obalanserat block

>>>> uppercase
Det här blocket saknar sin slutmarkör.`;

const parserRecoveryFixtureDocument = `>>>>! include "./modules/core.js"

# Parser recovery

>>>> uppercase |
Det första blocket har ett ofullständigt pipelineled.
<<<< uppercase

>>>> uppercase
Det här giltiga syskonblocket finns kvar i CST, AST och IR.
<<<< uppercase`;

const cancellationProbeFixtureDocument = `>>>>! include "./modules/conformance.js"

# Cancellation probe

>>>> conformance_probe suite="cancellation" wait_ms=280
Den här tentativa emissionen ska rullas tillbaka när run avbryts.
<<<< conformance_probe`;

const playgroundFixtures: PlaygroundFixture[] = [
  {
    id: "scope-torture",
    title: "Scope torture",
    summary: "Block, öppna intervall, order, inheritance, kanaler och Base64 i samma run.",
    document: sampleDocument,
  },
  {
    id: "parser-recovery",
    title: "Parser recovery",
    summary: "Ett lokalt syntaxfel ger partial CST/AST/IR men noll modul- eller domänexekvering.",
    document: parserRecoveryFixtureDocument,
  },
  {
    id: "editor-revision",
    title: "Editor revision",
    summary: "Flytta text och se skillnaden mellan stabil row-identitet och fysisk line.",
    document: editorFixtureDocument,
  },
  {
    id: "editor-kernel-revisions",
    title: "Kernel revisions",
    summary: "Versionsguardade textpatchar, stabila metadataidentiteter, delta och ankarkontinuitet.",
    document: editorKernelFixtureDocument,
  },
  {
    id: "verified-stage-cache",
    title: "Cache & safe branches",
    summary: "Två oberoende async-grenar, planordnad commit och verifierad sessionslokal cache reuse.",
    document: stageCacheFixtureDocument,
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
    conformance: { caseId: "negative-undeclared-channel", expectedOutcome: "failed", expectedDiagnosticCode: "TBA-TYPE-CHANNEL-LAB" },
  },
  {
    id: "data-join",
    title: "Data join",
    summary: "Två Markdown-tabeller blir typade records, en deterministisk inner join och spårbar JSON-tabell.",
    document: dataJoinFixtureDocument,
  },
  {
    id: "notebook-snapshot",
    title: "Notebook snapshot",
    summary: "Stabila cell-id:n, whole-snapshot, MIME bundles, explicit state och stale output.",
    document: notebookFixtureDocument,
  },
  {
    id: "annotation-review",
    title: "Annotation & AI review",
    summary: "Immutable modellkandidater, mänskliga review-revisioner och resolverbara standardprojektioner.",
    document: annotationReviewFixtureDocument,
  },
  {
    id: "conformance-golden",
    title: "Conformance golden",
    summary: "Versionssatt source → IR → plan → result → projection-snapshot med härledd profilgrind.",
    document: conformanceGoldenFixtureDocument,
    conformance: { caseId: "golden-core-chain", expectedOutcome: "succeeded" },
  },
  {
    id: "negative-unknown-function",
    title: "Negative · unknown function",
    summary: "Exakt terminalstatus och diagnostikkod verifieras utan committed output.",
    document: negativeUnknownFunctionFixtureDocument,
    conformance: { caseId: "negative-unknown-function", expectedOutcome: "failed", expectedDiagnosticCode: "TBA-RUN-LAB" },
  },
  {
    id: "negative-unclosed-block",
    title: "Negative · unclosed block",
    summary: "En obalanserad blockmarkör ger exakt recovery-kod och atomisk rollback.",
    document: negativeUnclosedBlockFixtureDocument,
    conformance: { caseId: "negative-unclosed-block", expectedOutcome: "failed", expectedDiagnosticCode: "TBA-PARSE-BLOCK-UNCLOSED-LAB" },
  },
  {
    id: "cancellation-probe",
    title: "Cancellation probe",
    summary: "En async stage emitterar tentativt, tar emot cancel och avslutas som cancelled utan durable output.",
    document: cancellationProbeFixtureDocument,
    conformance: { caseId: "cooperative-cancellation", expectedOutcome: "cancelled", expectedDiagnosticCode: "TBA-RUN-CANCELLED-LAB", autoCancelAfterMs: 60 },
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

const cacheModule = `define({
  cache_branch: {
    description: "Ren, deterministisk referensstage för sessionslokal cacheverifiering.",
    version: "1.0.0",
    behavior: "segment-preserving",
    state: "pure",
    determinism: "deterministic",
    effects: [],
    outputs: ["render"],
    args: { branch: { type: "string", description: "Stabil demonstrationsgren" } },
    async transform(input, args, context) {
      await context.checkpoint();
      return "**" + String(args.branch || "branch") + ":** " + String(input).trim() + "\\n";
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
  collect_row: {
    description: "Publicerar ett block som en stabil, positionsbunden metadatapost.",
    behavior: "segment-preserving",
    outputs: ["render", "system.out", "records"],
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
          required: ["kind", "text", "rowId"],
          properties: { kind: { type: "string" }, text: { type: "string" }, rowId: { type: "string" } }
        }
      }
    },
    args: {
      row_id: { type: "string", description: "Stabil domänidentitet över dokumentrevisioner" },
      channel: { type: "string", default: "records", description: "Deklarerad outputkanal" },
      kind: { type: "string", default: "row", description: "Metadatapostens typ" }
    },
    transform(input, args, context) {
      const rowId = String(args.row_id || "").trim();
      const channel = String(args.channel || "records");
      const kind = String(args.kind || "row");
      const text = String(input).trim();
      if (!rowId) throw new Error("collect_row kräver row_id.");
      if (!text) throw new Error("collect_row kräver ett icke-tomt block.");
      const payload = { kind, text, rowId };
      const location = { row: 1, rowId, rowSet: kind + "s", lineOffset: 0, kind: "annotation" };
      context.system.out.row(rowId, payload, location);
      context.emit(channel, payload, location);
      return input;
    }
  },

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

const dataModule = `function stableKey(prefix, value) {
  let hash = 2166136261;
  const source = prefix + ":" + String(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return prefix + ":" + (hash >>> 0).toString(36);
}

function cells(line) {
  return String(line).trim().replace(/^\\|/, "").replace(/\\|$/, "").split("|").map(value => value.trim());
}

function parseTable(input, name) {
  const lines = String(input).split("\\n");
  const headingOffset = lines.findIndex(line => line.trim() === "### " + name);
  if (headingOffset < 0) throw new Error("Datasetet “" + name + "” saknar rubriken ### " + name + ".");
  if (headingOffset + 2 >= lines.length) throw new Error("Datasetet “" + name + "” saknar en Markdown-tabell.");
  const fields = cells(lines[headingOffset + 1]);
  const separator = cells(lines[headingOffset + 2]);
  if (!fields.length || separator.length !== fields.length || !separator.every(value => /^:?-{3,}:?$/.test(value))) {
    throw new Error("Datasetet “" + name + "” har en ogiltig Markdown-tabellheader.");
  }
  const rawRows = [];
  for (let offset = headingOffset + 3; offset < lines.length; offset += 1) {
    const line = lines[offset];
    if (/^###\\s+/.test(line.trim())) break;
    if (!line.trim()) continue;
    if (!line.includes("|")) break;
    const values = cells(line);
    if (values.length !== fields.length) throw new Error("Datasetet “" + name + "” har fel antal celler på sin rad " + (offset + 1) + ".");
    rawRows.push({ lineOffset: offset, raw: Object.fromEntries(fields.map((field, index) => [field, values[index] || null])) });
  }
  if (!rawRows.length) throw new Error("Datasetet “" + name + "” saknar datarader.");
  const schemaFields = fields.map(field => {
    const populated = rawRows.map(row => row.raw[field]).filter(value => value !== null);
    const integer = populated.length > 0 && populated.every(value => /^-?\\d+$/.test(value));
    return { name: field, type: integer ? "integer" : "utf8", nullable: rawRows.some(row => row.raw[field] === null) };
  });
  const typedRows = rawRows.map(row => ({
    lineOffset: row.lineOffset,
    values: Object.fromEntries(schemaFields.map(field => [field.name, row.raw[field.name] === null ? null : field.type === "integer" ? Number(row.raw[field.name]) : row.raw[field.name]])),
  }));
  return { name, headingOffset, fields: schemaFields, rows: typedRows };
}

function markdownTable(fields, rows) {
  const display = value => value === null || value === undefined ? "" : String(value).replace(/\\|/g, "\\\\|");
  const header = "| " + fields.map(field => field.name).join(" | ") + " |";
  const separator = "| " + fields.map(field => field.type === "integer" ? "---:" : "---").join(" | ") + " |";
  return [header, separator, ...rows.map(row => "| " + fields.map(field => display(row.values[field.name])).join(" | ") + " |")].join("\\n");
}

define({
  relational_join: {
    description: "Läser två GFM-tabeller, gör en deterministisk inner join och emitterar typade data- och lineage-events.",
    behavior: "reducing",
    outputs: ["render", "data.datasets", "data.input.records", "data.output.records", "data.lineage", "data.aggregates", "data.metrics"],
    channels: {
      "data.datasets": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/dataset/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.datasetId"],
        schema: { type: "object", required: ["datasetId", "schemaRef", "role", "key", "fields", "recordCount"], properties: { datasetId: { type: "string" }, schemaRef: { type: "string" }, role: { type: "string" }, key: { type: "array" }, fields: { type: "array" }, recordCount: { type: "integer" } } }
      },
      "data.input.records": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/data-record/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.recordId"],
        schema: { type: "object", required: ["datasetId", "recordId", "schemaRef", "key", "values"], properties: { datasetId: { type: "string" }, recordId: { type: "string" }, schemaRef: { type: "string" }, key: { type: "object" }, values: { type: "object" } } }
      },
      "data.output.records": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/data-record/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.recordId"],
        schema: { type: "object", required: ["datasetId", "recordId", "schemaRef", "key", "values"], properties: { datasetId: { type: "string" }, recordId: { type: "string" }, schemaRef: { type: "string" }, key: { type: "object" }, values: { type: "object" } } }
      },
      "data.lineage": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/data-lineage/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.lineageId"],
        schema: { type: "object", required: ["lineageId", "operation", "granularity", "mapping", "output", "inputs", "inputAnchorRefs"], properties: { lineageId: { type: "string" }, operation: { type: "string" }, granularity: { type: "string" }, mapping: { type: "string" }, output: { type: "object" }, inputs: { type: "array" }, inputAnchorRefs: { type: "array" } } }
      },
      "data.aggregates": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/data-aggregate/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.aggregationId"],
        schema: { type: "object", required: ["aggregationId", "operation", "mapping", "inputDatasetId", "inputRecordIds", "value"], properties: { aggregationId: { type: "string" }, operation: { type: "string" }, mapping: { type: "string" }, inputDatasetId: { type: "string" }, inputRecordIds: { type: "array" }, value: { type: "integer" } } }
      },
      "data.metrics": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/data-metric/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.operation"],
        schema: { type: "object", required: ["operation", "leftRows", "rightRows", "outputRows", "matchedRows"], properties: { operation: { type: "string" }, leftRows: { type: "integer" }, rightRows: { type: "integer" }, outputRows: { type: "integer" }, matchedRows: { type: "integer" } } }
      }
    },
    args: {
      left: { type: "string", description: "Vänster dataset och ###-rubrik" },
      right: { type: "string", description: "Höger dataset och ###-rubrik" },
      on: { type: "string", description: "Gemensam join key" },
      as: { type: "string", description: "Output-datasetets id" }
    },
    transform(input, args, context) {
      const leftName = String(args.left || "");
      const rightName = String(args.right || "");
      const joinKey = String(args.on || "");
      const outputName = String(args.as || (leftName + "_" + rightName));
      if (!leftName || !rightName || !joinKey) throw new Error("relational_join kräver left, right och on.");
      const left = parseTable(input, leftName);
      const right = parseTable(input, rightName);
      if (!left.fields.some(field => field.name === joinKey) || !right.fields.some(field => field.name === joinKey)) throw new Error("Join key “" + joinKey + "” måste finnas i båda dataseten.");

      const prepare = table => {
        const seen = new Set();
        return table.rows.map(row => {
          const keyValue = row.values[joinKey];
          if (keyValue === null || keyValue === undefined || keyValue === "") throw new Error("Datasetet “" + table.name + "” har en tom join key.");
          const typedKey = typeof keyValue + ":" + String(keyValue);
          if (seen.has(typedKey)) throw new Error("Datasetet “" + table.name + "” har duplicerad join key “" + keyValue + "”.");
          seen.add(typedKey);
          return { ...row, keyValue, typedKey, recordId: stableKey("record:" + table.name, typedKey) };
        });
      };
      const leftRecords = prepare(left);
      const rightRecords = prepare(right);
      const rightByKey = new Map(rightRecords.map(record => [record.typedKey, record]));
      const leftFieldNames = new Set(left.fields.map(field => field.name));
      const outputFields = left.fields.map(field => ({ ...field, source: { datasetId: leftName, column: field.name } }));
      for (const field of right.fields) {
        if (field.name === joinKey) continue;
        const outputColumn = leftFieldNames.has(field.name) ? rightName + "_" + field.name : field.name;
        outputFields.push({ name: outputColumn, type: field.type, nullable: field.nullable, source: { datasetId: rightName, column: field.name } });
      }
      const joined = leftRecords.flatMap(leftRecord => {
        const rightRecord = rightByKey.get(leftRecord.typedKey);
        if (!rightRecord) return [];
        const values = { ...leftRecord.values };
        for (const field of outputFields.filter(field => field.source.datasetId === rightName)) values[field.name] = rightRecord.values[field.source.column];
        return [{
          left: leftRecord,
          right: rightRecord,
          values,
          recordId: stableKey("record:" + outputName, leftRecord.typedKey),
        }];
      });
      const schemaRef = name => "schema:textabana/dataset/" + name + "/lab-v1";
      const datasetPayload = (table, role, count, fields) => ({ datasetId: table, schemaRef: schemaRef(table), role, key: [joinKey], fields: fields.map(({ source, ...field }) => field), recordCount: count });
      const leftDatasetEvent = context.emit("data.datasets", datasetPayload(leftName, "input", leftRecords.length, left.fields), { mode: "row", rowId: "dataset:" + leftName, rowSet: "datasets", lineOffset: left.headingOffset, kind: "dataset", datasetId: leftName });
      const rightDatasetEvent = context.emit("data.datasets", datasetPayload(rightName, "input", rightRecords.length, right.fields), { mode: "row", rowId: "dataset:" + rightName, rowSet: "datasets", lineOffset: right.headingOffset, kind: "dataset", datasetId: rightName });
      context.emit("data.datasets", datasetPayload(outputName, "output", joined.length, outputFields), { mode: "row", rowId: "dataset:" + outputName, rowSet: "datasets", lineOffset: left.headingOffset, kind: "dataset", datasetId: outputName, mapping: "derived", inputAnchorRefs: [leftDatasetEvent.target.anchorRef, rightDatasetEvent.target.anchorRef], outputSelector: { type: "DataSelector", datasetId: outputName } });

      const inputEvents = new Map();
      for (const table of [{ name: leftName, records: leftRecords }, { name: rightName, records: rightRecords }]) {
        for (let index = 0; index < table.records.length; index += 1) {
          const record = table.records[index];
          const payload = { datasetId: table.name, recordId: record.recordId, schemaRef: schemaRef(table.name), key: { [joinKey]: record.keyValue }, values: record.values };
          const event = context.emit("data.input.records", payload, { mode: "row", row: index + 1, rowId: record.recordId, rowSet: table.name, lineOffset: record.lineOffset, kind: "data-record", datasetId: table.name, recordId: record.recordId, outputSelector: { type: "DataSelector", datasetId: table.name, recordId: record.recordId } });
          inputEvents.set(record.recordId, event);
        }
      }

      const outputEvents = [];
      for (let index = 0; index < joined.length; index += 1) {
        const record = joined[index];
        const leftEvent = inputEvents.get(record.left.recordId);
        const rightEvent = inputEvents.get(record.right.recordId);
        const inputAnchorRefs = [leftEvent.target.anchorRef, rightEvent.target.anchorRef];
        const inputSelectors = [
          { type: "DataSelector", datasetId: leftName, recordId: record.left.recordId },
          { type: "DataSelector", datasetId: rightName, recordId: record.right.recordId },
        ];
        const outputSelector = { type: "DataSelector", datasetId: outputName, recordId: record.recordId };
        const payload = { datasetId: outputName, recordId: record.recordId, schemaRef: schemaRef(outputName), key: { [joinKey]: record.left.keyValue }, values: record.values };
        const outputEvent = context.emit("data.output.records", payload, { mode: "row", row: index + 1, rowId: record.recordId, rowSet: outputName, lineOffset: record.left.lineOffset, kind: "data-record", datasetId: outputName, recordId: record.recordId, mapping: "derived", inputAnchorRefs, inputSelectors, outputSelector });
        outputEvents.push(outputEvent);
        const recordLineage = {
          lineageId: stableKey("lineage:record:" + outputName, record.recordId), operation: "inner-join", granularity: "record", mapping: "derived",
          output: { datasetId: outputName, recordId: record.recordId }, inputs: inputSelectors, inputRecordIds: [record.left.recordId, record.right.recordId], inputAnchorRefs,
        };
        context.emit("data.lineage", recordLineage, { mode: "row", row: index + 1, rowId: recordLineage.lineageId, rowSet: outputName + ":lineage", lineOffset: record.left.lineOffset, kind: "record-lineage", datasetId: outputName, recordId: record.recordId, mapping: "derived", inputAnchorRefs, inputSelectors, outputSelector });

        for (const field of outputFields) {
          const fromLeft = field.source.datasetId === leftName;
          const isJoinKey = field.name === joinKey;
          const inputs = isJoinKey ? [
            { type: "DataSelector", datasetId: leftName, recordId: record.left.recordId, column: joinKey },
            { type: "DataSelector", datasetId: rightName, recordId: record.right.recordId, column: joinKey },
          ] : [{ type: "DataSelector", datasetId: field.source.datasetId, recordId: fromLeft ? record.left.recordId : record.right.recordId, column: field.source.column }];
          const cellAnchors = isJoinKey ? inputAnchorRefs : [fromLeft ? leftEvent.target.anchorRef : rightEvent.target.anchorRef];
          const cellOutput = { type: "DataSelector", datasetId: outputName, recordId: record.recordId, column: field.name };
          const cellLineage = { lineageId: stableKey("lineage:cell:" + outputName + ":" + field.name, record.recordId), operation: "inner-join", granularity: "cell", mapping: "derived", output: { datasetId: outputName, recordId: record.recordId, column: field.name }, inputs, inputAnchorRefs: cellAnchors };
          context.emit("data.lineage", cellLineage, { mode: "row", row: index + 1, rowId: cellLineage.lineageId, rowSet: outputName + ":cells", lineOffset: fromLeft ? record.left.lineOffset : record.right.lineOffset, kind: "cell-lineage", datasetId: outputName, recordId: record.recordId, columnName: field.name, mapping: "derived", inputAnchorRefs: cellAnchors, inputSelectors: inputs, outputSelector: cellOutput });
        }
      }

      const outputAnchorRefs = outputEvents.length ? outputEvents.map(event => event.target.anchorRef) : [leftDatasetEvent.target.anchorRef, rightDatasetEvent.target.anchorRef];
      const outputSelectors = joined.map(record => ({ type: "DataSelector", datasetId: outputName, recordId: record.recordId }));
      const aggregationId = "aggregate:" + outputName + ":count";
      context.emit("data.aggregates", { aggregationId, operation: "count", mapping: "derived", inputDatasetId: outputName, inputRecordIds: joined.map(record => record.recordId), value: joined.length }, { mode: "row", rowId: aggregationId, rowSet: outputName + ":aggregates", lineOffset: left.headingOffset, kind: "aggregate", datasetId: outputName + ":aggregates", recordId: aggregationId, mapping: "derived", inputAnchorRefs: outputAnchorRefs, inputSelectors: outputSelectors, outputSelector: { type: "DataSelector", datasetId: outputName + ":aggregates", recordId: aggregationId, column: "count" } });
      context.emit("data.metrics", { operation: "inner-join", leftRows: leftRecords.length, rightRows: rightRecords.length, outputRows: joined.length, matchedRows: joined.length }, { mode: "row", rowId: "metric:" + outputName, rowSet: "metrics", lineOffset: left.headingOffset, kind: "metric", mapping: "derived", inputAnchorRefs: [leftDatasetEvent.target.anchorRef, rightDatasetEvent.target.anchorRef] });
      return markdownTable(outputFields, joined);
    }
  }
});`;

const notebookModule = `function notebookHash(value) {
  let hash = 2166136261;
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function notebookCanonical(value) {
  if (Array.isArray(value)) return "[" + value.map(notebookCanonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + notebookCanonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function notebookProperties(source) {
  const properties = {};
  const pattern = /([A-Za-z_][\\w.-]*)=("([^"]*)"|'([^']*)'|([^\\s]+))/g;
  let match;
  while ((match = pattern.exec(source)) !== null) properties[match[1]] = match[3] ?? match[4] ?? match[5];
  return properties;
}

function notebookCells(source) {
  const lines = String(source).replace(/\\r\\n?/g, "\\n").split("\\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^##\\s+Cell:/.test(lines[index])) continue;
    const match = lines[index].match(/^##\\s+Cell:\\s*(.+?)\\s+\\{#([A-Za-z][A-Za-z0-9_.:-]*)([^}]*)\\}\\s*$/);
    if (!match) throw new Error("Notebookcellen på blockrad " + (index + 1) + " måste ha syntaxen ## Cell: Titel {#stabilt-cell-id}.");
    starts.push({ index, title: match[1].trim(), cellId: match[2], authored: notebookProperties(match[3]) });
  }
  if (!starts.length) throw new Error("notebook_snapshot kräver minst en ## Cell med explicit cell-id.");
  const ids = starts.map(cell => cell.cellId);
  if (new Set(ids).size !== ids.length) throw new Error("notebook_snapshot har duplicerade cell-id:n.");
  return starts.map((cell, index) => {
    const end = starts[index + 1]?.index ?? lines.length;
    const sourceText = lines.slice(cell.index + 1, end).join("\\n").trim();
    const sourceDigest = "fnv1a:" + notebookHash(sourceText);
    return { ...cell, source: sourceText, sourceDigest };
  });
}

define({
  notebook_snapshot: {
    description: "Projekterar ett helt dokumentblock till stabila notebookceller och MIME bundles utan kernelstate.",
    behavior: "segment-preserving",
    outputs: ["render", "notebook.snapshot", "notebook.cells", "notebook.outputs", "notebook.state"],
    channels: {
      "notebook.snapshot": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/notebook-snapshot/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.snapshotId"],
        schema: { type: "object", required: ["notebookId", "snapshotId", "profile", "wholeSnapshot", "cellIds", "cellCount"] }
      },
      "notebook.cells": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/notebook-cell/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.cellId"],
        schema: { type: "object", required: ["notebookId", "snapshotId", "cellId", "title", "index", "sourceDigest", "source", "language", "metadata"] }
      },
      "notebook.outputs": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/notebook-output/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.cellId"],
        schema: { type: "object", required: ["notebookId", "snapshotId", "cellId", "sourceDigest", "outputDigest", "status", "mimeBundle", "metadata"] }
      },
      "notebook.state": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/notebook-state/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.notebookId"],
        schema: { type: "object", required: ["notebookId", "snapshotId", "profile", "requestedProfile", "executionSupport", "wholeSnapshot", "kernelState", "limitations"] }
      }
    },
    args: {
      profile: { type: "string", default: "fresh", description: "fresh, session eller attached" },
      notebook_id: { type: "string", description: "Stabil notebook-identitet" }
    },
    transform(input, args, context) {
      const profile = String(args.profile || "fresh");
      if (!["fresh", "session", "attached"].includes(profile)) throw new Error("notebook_snapshot profile måste vara fresh, session eller attached.");
      const notebookId = String(args.notebook_id || "notebook").trim();
      if (!notebookId) throw new Error("notebook_snapshot kräver notebook_id.");
      const cells = notebookCells(context.authoredInput ?? input);
      const snapshotId = "snapshot:" + notebookHash(notebookCanonical({ notebookId, cells: cells.map(cell => ({ cellId: cell.cellId, sourceDigest: cell.sourceDigest, metadata: cell.authored })) }));
      const executionSupport = profile === "fresh" ? "playground-subset" : "contract-only";
      const limitations = profile === "fresh"
        ? ["structural-projection-only", "no-jupyter-messaging", "no-nbformat-roundtrip", "no-kernel"]
        : ["kernel-profile-declared-not-executed", "no-jupyter-messaging", "no-nbformat-roundtrip", "no-comms-or-widgets"];
      const prepared = cells.map((cell, index) => {
        const resultValue = { notebookId, cellId: cell.cellId, sourceDigest: cell.sourceDigest, profile, status: "fresh" };
        const mimeBundle = {
          "text/plain": cell.source,
          "text/markdown": cell.source,
          "application/vnd.textabana.result+json": resultValue
        };
        return {
          cell: {
            notebookId, snapshotId, cellId: cell.cellId, title: cell.title, index,
            sourceDigest: cell.sourceDigest, source: cell.source, language: "markdown",
            metadata: { authored: cell.authored, textabana: { notebookId, snapshotId, cellId: cell.cellId } }
          },
          output: {
            notebookId, snapshotId, cellId: cell.cellId, sourceDigest: cell.sourceDigest,
            outputDigest: "fnv1a:" + notebookHash(notebookCanonical(mimeBundle)), status: "fresh", mimeBundle,
            metadata: { textabana: { notebookId, snapshotId, cellId: cell.cellId, sourceDigest: cell.sourceDigest } }
          },
          lineOffset: cell.index
        };
      });

      context.emit("notebook.snapshot", { notebookId, snapshotId, profile, wholeSnapshot: true, cellIds: cells.map(cell => cell.cellId), cellCount: cells.length, metadata: { textabana: { format: "markdown-cell-headings", digestAlgorithm: "fnv1a-lab" } } }, { mode: "row", rowId: "snapshot:" + notebookId, rowSet: notebookId, lineOffset: cells[0].index, kind: "notebook-snapshot", notebookId });
      context.emit("notebook.state", { notebookId, snapshotId, profile, requestedProfile: profile, executionSupport, wholeSnapshot: true, kernelState: profile === "fresh" ? "not-used" : "external-unverified", limitations }, { mode: "row", rowId: "state:" + notebookId, rowSet: notebookId, lineOffset: cells[0].index, kind: "notebook-state", notebookId });
      for (const item of prepared) {
        const selector = { type: "CellSelector", notebookId, cellId: item.cell.cellId };
        const cellEvent = context.emit("notebook.cells", item.cell, { mode: "row", row: item.cell.index + 1, rowId: notebookId + ":" + item.cell.cellId, rowSet: notebookId, lineOffset: item.lineOffset, kind: "notebook-cell", notebookId, cellId: item.cell.cellId, outputSelector: selector });
        context.emit("notebook.outputs", item.output, { mode: "row", row: item.cell.index + 1, rowId: notebookId + ":" + item.cell.cellId, rowSet: notebookId, lineOffset: item.lineOffset, kind: "notebook-output", notebookId, cellId: item.cell.cellId, mapping: "derived", inputAnchorRefs: [cellEvent.target.anchorRef], inputSelectors: [selector], outputSelector: selector });
      }
      return input;
    }
  }
});`;

const annotationModule = `function annotationHash(value) {
  let hash = 2166136261;
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function annotationCanonical(value) {
  if (Array.isArray(value)) return "[" + value.map(annotationCanonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + annotationCanonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function annotationDigest(value) {
  return "fnv1a:" + annotationHash(typeof value === "string" ? value : annotationCanonical(value));
}

function annotationProperties(source) {
  const properties = {};
  const pattern = /([A-Za-z_][\\w.-]*)=("([^"]*)"|'([^']*)'|([^\\s]+))/g;
  let match;
  while ((match = pattern.exec(source)) !== null) properties[match[1]] = match[3] ?? match[4] ?? match[5];
  return properties;
}

function annotationEntries(source) {
  const lines = String(source).replace(/\\r\\n?/g, "\\n").split("\\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^##\\s+Annotation:/.test(lines[index])) continue;
    const match = lines[index].match(/^##\\s+Annotation:\\s*(.+?)\\s+\\{#([A-Za-z][A-Za-z0-9_.:-]*)([^}]*)\\}\\s*$/);
    if (!match) throw new Error("Annotationen på blockrad " + (index + 1) + " måste ha syntaxen ## Annotation: Titel {#stabilt-id ...}.");
    starts.push({ headingIndex: index, title: match[1].trim(), annotationId: match[2], authored: annotationProperties(match[3]) });
  }
  if (!starts.length) throw new Error("annotation_review kräver minst en ## Annotation med explicit id.");
  if (new Set(starts.map(item => item.annotationId)).size !== starts.length) throw new Error("annotation_review har duplicerade annotation-id:n.");
  return starts.map((entry, index) => {
    const end = starts[index + 1]?.headingIndex ?? lines.length;
    const bodyRows = [];
    for (let cursor = entry.headingIndex + 1; cursor < end; cursor += 1) {
      const text = lines[cursor].trim();
      if (text) bodyRows.push({ index: cursor, text });
    }
    if (bodyRows.length !== 1) throw new Error("Annotationen “" + entry.annotationId + "” måste ha exakt en icke-tom textrad i denna lab-subset.");
    return { ...entry, body: bodyRows[0].text, lineOffset: bodyRows[0].index, bodyDigest: annotationDigest(bodyRows[0].text) };
  });
}

define({
  annotation_review: {
    description: "Bygger immutable AI-kandidater, mänskliga review-event och append-only revisioner från lättviktig Markdown.",
    behavior: "segment-preserving",
    outputs: ["render", "annotation.set", "annotation.candidates", "annotation.reviews", "annotation.revisions"],
    channels: {
      "annotation.set": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/annotation-set/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.setId"],
        schema: { type: "object", required: ["setId", "wholeSnapshot", "authoredOrder", "annotationIds", "candidateIds", "currentIds", "candidateCount", "reviewCount", "revisionCount", "setDigest", "digestAlgorithm"] }
      },
      "annotation.candidates": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/annotation-candidate/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.annotationId"],
        schema: { type: "object", required: ["setId", "annotationId", "title", "body", "bodyDigest", "inputDigest", "origin", "status", "revision", "model", "prompt", "confidence", "candidateDigest"] }
      },
      "annotation.reviews": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/annotation-review/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.reviewId"],
        schema: { type: "object", required: ["reviewId", "setId", "annotationId", "candidateEventRef", "revision", "decision", "reviewer", "logicalTime", "reviewDigest"] }
      },
      "annotation.revisions": {
        payloadKind: "object", mediaType: "application/json", schemaRef: "schema:textabana/annotation-revision/lab-v1",
        delivery: "snapshot", persistence: "durable", ordering: "global-sequence", key: ["payload.revisionId"],
        schema: { type: "object", required: ["revisionId", "setId", "annotationId", "revision", "origin", "state", "body", "bodyDigest", "revisionDigest"] }
      }
    },
    args: {
      set_id: { type: "string", description: "Stabil identitet för annotation snapshot" },
      reviewer: { type: "string", description: "Explicit mänsklig reviewer" }
    },
    transform(input, args, context) {
      const setId = String(args.set_id || "").trim();
      const defaultReviewer = String(args.reviewer || "").trim();
      if (!setId) throw new Error("annotation_review kräver set_id.");
      if (!defaultReviewer) throw new Error("annotation_review kräver reviewer.");
      const entries = annotationEntries(context.authoredInput ?? input);
      const byId = new Map(entries.map(entry => [entry.annotationId, entry]));
      const candidates = entries.filter(entry => String(entry.authored.origin || "ai") === "ai");
      const replacements = entries.filter(entry => String(entry.authored.origin || "ai") === "human");
      if (!candidates.length) throw new Error("annotation_review kräver minst en AI-kandidat.");

      for (const entry of entries) {
        const origin = String(entry.authored.origin || "ai");
        if (!['ai', 'human'].includes(origin)) throw new Error("Annotationen “" + entry.annotationId + "” har ogiltigt origin.");
        if (origin === "ai") {
          const score = Number(entry.authored.confidence);
          if (!entry.authored.model || !entry.authored.model_version || !entry.authored.prompt_id || !entry.authored.confidence_method || !Number.isFinite(score) || score < 0 || score > 1) {
            throw new Error("AI-kandidaten “" + entry.annotationId + "” kräver model, model_version, prompt_id, confidence 0..1 och confidence_method.");
          }
          if (!["accept", "reject", "supersede"].includes(entry.authored.decision)) throw new Error("AI-kandidaten “" + entry.annotationId + "” kräver decision=accept, reject eller supersede.");
          if (entry.authored.decision === "supersede" && !entry.authored.superseded_by) throw new Error("AI-kandidaten “" + entry.annotationId + "” måste ange superseded_by vid supersede.");
          if (entry.authored.decision !== "supersede" && entry.authored.superseded_by) throw new Error("AI-kandidaten “" + entry.annotationId + "” får bara ange superseded_by vid supersede.");
        } else if (!entry.authored.supersedes) {
          throw new Error("Den mänskliga annotationen “" + entry.annotationId + "” måste ange supersedes.");
        }
      }

      for (const candidate of candidates) {
        if (candidate.authored.decision !== "supersede") continue;
        const replacement = byId.get(candidate.authored.superseded_by);
        if (!replacement || replacement.authored.origin !== "human" || replacement.authored.supersedes !== candidate.annotationId) {
          throw new Error("AI-kandidaten “" + candidate.annotationId + "” har ingen matchande mänsklig ersättare.");
        }
      }
      for (const replacement of replacements) {
        const target = byId.get(replacement.authored.supersedes);
        if (!target || target.authored.origin !== "ai" || target.authored.decision !== "supersede" || target.authored.superseded_by !== replacement.annotationId) {
          throw new Error("Ersättaren “" + replacement.annotationId + "” har en bruten supersedes-kedja.");
        }
      }

      const candidateEvents = new Map();
      for (const candidate of candidates) {
        const model = {
          id: candidate.authored.model,
          version: candidate.authored.model_version,
          digest: annotationDigest({ id: candidate.authored.model, version: candidate.authored.model_version })
        };
        const prompt = { id: candidate.authored.prompt_id, digest: annotationDigest({ id: candidate.authored.prompt_id }) };
        const payloadBase = {
          setId, annotationId: candidate.annotationId, title: candidate.title, body: candidate.body,
          bodyDigest: candidate.bodyDigest, inputDigest: candidate.bodyDigest, origin: "ai", status: "candidate", revision: 0,
          motivation: "assessing", model, prompt,
          confidence: { score: Number(candidate.authored.confidence), method: candidate.authored.confidence_method },
          digestAlgorithm: "fnv1a-lab"
        };
        const payload = { ...payloadBase, candidateDigest: annotationDigest(payloadBase) };
        const event = context.emit("annotation.candidates", payload, {
          mode: "row", rowId: setId + ":" + candidate.annotationId, rowSet: setId, lineOffset: candidate.lineOffset,
          kind: "annotation-candidate", setId, annotationId: candidate.annotationId, revision: 0, mapping: "exact"
        });
        candidateEvents.set(candidate.annotationId, event);
      }

      const replacementEvents = new Map();
      for (const replacement of replacements) {
        const reviewer = String(replacement.authored.reviewer || defaultReviewer);
        const revisionBase = {
          revisionId: "revision:" + replacement.annotationId + ":0", setId, annotationId: replacement.annotationId,
          revision: 0, origin: "human", state: "accepted", title: replacement.title, body: replacement.body,
          bodyDigest: replacement.bodyDigest, supersedes: replacement.authored.supersedes, reviewer, logicalTime: "revision:0",
          digestAlgorithm: "fnv1a-lab"
        };
        const payload = { ...revisionBase, revisionDigest: annotationDigest(revisionBase) };
        const event = context.emit("annotation.revisions", payload, {
          mode: "row", rowId: setId + ":" + replacement.annotationId, rowSet: setId, lineOffset: replacement.lineOffset,
          kind: "annotation-revision", setId, annotationId: replacement.annotationId, revision: 0, mapping: "exact"
        });
        replacementEvents.set(replacement.annotationId, event);
      }

      const reviewEvents = new Map();
      const decisionRevisionEvents = new Map();
      const stateFor = { accept: "accepted", reject: "rejected", supersede: "superseded" };
      for (const candidate of candidates) {
        const candidateEvent = candidateEvents.get(candidate.annotationId);
        const replacementEvent = candidate.authored.superseded_by ? replacementEvents.get(candidate.authored.superseded_by) : null;
        const inputAnchorRefs = [candidateEvent.target.anchorRef];
        if (replacementEvent) inputAnchorRefs.push(replacementEvent.target.anchorRef);
        const reviewBase = {
          reviewId: "review:" + candidate.annotationId + ":1", setId, annotationId: candidate.annotationId,
          candidateEventRef: candidateEvent.eventId, revision: 1, decision: candidate.authored.decision,
          reviewer: defaultReviewer, logicalTime: "revision:1", digestAlgorithm: "fnv1a-lab",
          ...(candidate.authored.superseded_by ? { supersededBy: candidate.authored.superseded_by } : {})
        };
        const reviewPayload = { ...reviewBase, reviewDigest: annotationDigest(reviewBase) };
        const reviewEvent = context.emit("annotation.reviews", reviewPayload, {
          mode: "row", rowId: setId + ":" + candidate.annotationId, rowSet: setId, lineOffset: candidate.lineOffset,
          kind: "annotation-review", setId, annotationId: candidate.annotationId, revision: 1, mapping: "derived", inputAnchorRefs
        });
        reviewEvents.set(candidate.annotationId, reviewEvent);

        const revisionBase = {
          revisionId: "revision:" + candidate.annotationId + ":1", setId, annotationId: candidate.annotationId,
          revision: 1, origin: "human-review", state: stateFor[candidate.authored.decision], title: candidate.title,
          body: candidate.body, bodyDigest: candidate.bodyDigest, basedOnEventRef: candidateEvent.eventId,
          reviewEventRef: reviewEvent.eventId, reviewer: defaultReviewer, logicalTime: "revision:1", digestAlgorithm: "fnv1a-lab",
          ...(candidate.authored.superseded_by ? { supersededBy: candidate.authored.superseded_by } : {})
        };
        const revisionPayload = { ...revisionBase, revisionDigest: annotationDigest(revisionBase) };
        const revisionEvent = context.emit("annotation.revisions", revisionPayload, {
          mode: "row", rowId: setId + ":" + candidate.annotationId, rowSet: setId, lineOffset: candidate.lineOffset,
          kind: "annotation-revision", setId, annotationId: candidate.annotationId, revision: 1,
          mapping: "derived", inputAnchorRefs
        });
        decisionRevisionEvents.set(candidate.annotationId, revisionEvent);
      }

      const authoredOrder = entries.map(entry => entry.annotationId);
      const candidateIds = candidates.map(entry => entry.annotationId);
      const replacementIds = replacements.map(entry => entry.annotationId);
      const annotationIds = [...candidateIds, ...replacementIds];
      const currentIds = entries.filter(entry => entry.authored.origin === "human" || entry.authored.decision === "accept").map(entry => entry.annotationId);
      const setBase = {
        setId, wholeSnapshot: true, authoredOrder, annotationIds, candidateIds, currentIds,
        candidateCount: candidateEvents.size, reviewCount: reviewEvents.size,
        revisionCount: replacementEvents.size + decisionRevisionEvents.size, digestAlgorithm: "fnv1a-lab"
      };
      const setPayload = { ...setBase, setDigest: annotationDigest(setBase) };
      const allAnchorRefs = [...candidateEvents.values(), ...replacementEvents.values()].map(event => event.target.anchorRef);
      context.emit("annotation.set", setPayload, {
        mode: "row", rowId: "annotation-set:" + setId, rowSet: setId, lineOffset: entries[0].lineOffset,
        kind: "annotation-set", setId, mapping: "derived", inputAnchorRefs: allAnchorRefs,
        outputSelector: { type: "AnnotationSetSelector", setId }
      });
      return input;
    }
  }
});`;

const conformanceModule = `function probeKey(suite, text) {
  let hash = 2166136261;
  const source = suite + ":" + text;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return "probe:" + (hash >>> 0).toString(36);
}

define({
  conformance_probe: {
    description: "Emitterar deterministiska, positionsbundna probes och erbjuder en riktig kooperativ cancellation-gräns.",
    behavior: "segment-preserving",
    outputs: ["render", "system.out", "conformance.probes"],
    channels: {
      "conformance.probes": {
        payloadKind: "object",
        mediaType: "application/json",
        schemaRef: "schema:textabana/conformance-probe/lab-v1",
        delivery: "snapshot",
        persistence: "durable",
        ordering: "global-sequence",
        key: ["payload.probeId"],
        schema: {
          type: "object",
          required: ["probeId", "suite", "text"],
          properties: { probeId: { type: "string" }, suite: { type: "string" }, text: { type: "string" } }
        }
      }
    },
    args: {
      suite: { type: "string", default: "core-chain" },
      wait_ms: { type: "number", default: 0 }
    },
    async transform(input, args, context) {
      const suite = String(args.suite || "core-chain");
      let row = 0;
      String(input).split("\\n").forEach((sourceLine, lineOffset) => {
        const text = sourceLine.trim();
        if (!text) return;
        row += 1;
        const probeId = probeKey(suite, text);
        const payload = { probeId, suite, text };
        const location = { row, rowId: probeId, rowSet: "conformance-probes", lineOffset, kind: "conformance-probe" };
        context.emit("conformance.probes", payload, location);
        context.system.out.row(probeId, payload, location);
      });
      const wait = Math.max(0, Number(args.wait_ms || 0));
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      await context.checkpoint();
      context.signal.throwIfAborted();
      return input;
    }
  }
});`;

const initialFiles: ProjectFile[] = [
  { path: "document.md", kind: "document", content: sampleDocument },
  { path: "modules/core.js", kind: "module", content: coreModule },
  { path: "modules/cache.js", kind: "module", content: cacheModule },
  { path: "modules/editorial.js", kind: "module", content: editorialModule },
  { path: "modules/base64.js", kind: "module", content: base64Module },
  { path: "modules/metadata.js", kind: "module", content: metadataModule },
  { path: "modules/data.js", kind: "module", content: dataModule },
  { path: "modules/notebook.js", kind: "module", content: notebookModule },
  { path: "modules/annotation.js", kind: "module", content: annotationModule },
  { path: "modules/conformance.js", kind: "module", content: conformanceModule },
];

const storageKey = "textabana-project-v12-concurrent-scheduler";

function filesForFixture(fixtureId: string): ProjectFile[] {
  const fixture = playgroundFixtures.find((item) => item.id === fixtureId) ?? playgroundFixtures[0];
  return initialFiles.map((file) => file.kind === "document" ? { ...file, content: fixture.document } : { ...file });
}

function singleTextChange(before: string, after: string) {
  const previous = Array.from(before);
  const next = Array.from(after);
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < next.length - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix += 1;
  return {
    range: { from: prefix, to: previous.length - suffix },
    insert: next.slice(prefix, next.length - suffix).join(""),
  };
}

interface KernelDocumentHead {
  documentId: string;
  path: string;
  source: string;
  revision: number;
  documentVersion: string;
}

interface KernelProtocolResponse {
  type: "kernel-response";
  requestId: string | null;
  command: string;
  ok: boolean;
  status?: string;
  document?: {
    documentId: string;
    path: string;
    documentRevision: number;
    documentVersion: string;
  };
  error?: { code?: string; message?: string };
}

interface PendingKernelRequest {
  resolve: (response: KernelProtocolResponse) => void;
  reject: (error: Error) => void;
  timeout: number;
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
  invalidationPreview: null,
  executionTrace: [],
  executionReport: null,
  executionStats: { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
  resultEnvelope: null,
  adapterRun: null,
  conformanceReport: null,
  editorKernel: null,
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
  const [semanticIdentity, setSemanticIdentity] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [result, setResult] = useState<RuntimeResult>(emptyRuntimeResult);
  const [previousResult, setPreviousResult] = useState<RuntimeResult | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const kernelDocumentRef = useRef<KernelDocumentHead | null>(null);
  const kernelRequestsRef = useRef(new Map<string, PendingKernelRequest>());
  const kernelCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const kernelIntentRef = useRef(0);
  const kernelReplaceSessionRef = useRef(false);
  const postedRunIdsRef = useRef(new Set<number>());
  const latchedCancellationRef = useRef(new Set<number>());
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
    const kernelRequests = kernelRequestsRef.current;
    workerRef.current = worker;
    worker.onmessage = (event) => {
      if (event.data.type === "kernel-response") {
        const pending = kernelRequests.get(event.data.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timeout);
        kernelRequests.delete(event.data.requestId);
        if (event.data.ok) pending.resolve(event.data as KernelProtocolResponse);
        else {
          const error = new Error(event.data.error?.message || "Editor Kernel avvisade kommandot.");
          Object.assign(error, { code: event.data.error?.code || "TBA-EDITOR-PROTOCOL-LAB" });
          pending.reject(error);
        }
        return;
      }
      if (Number.isInteger(event.data.runId)) {
        postedRunIdsRef.current.delete(event.data.runId);
        latchedCancellationRef.current.delete(event.data.runId);
      }
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
        invalidationPreview: event.data.invalidationPreview ?? null,
        executionTrace: event.data.executionTrace ?? [],
        executionReport: event.data.executionReport ?? null,
        executionStats: event.data.executionStats ?? { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
        resultEnvelope: event.data.resultEnvelope ?? null,
        adapterRun: event.data.adapterRun ?? null,
        conformanceReport: event.data.conformanceReport ?? null,
        semanticIdentity: event.data.semanticIdentity ?? null,
        editorKernel: event.data.editorKernel ?? null,
        capabilities: event.data.capabilities ?? null,
        cancelled: event.data.cancelled === true,
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
      for (const pending of kernelRequests.values()) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error("Körmotorn kunde inte starta."));
      }
      kernelRequests.clear();
      const failed = { ...emptyRuntimeResult, runId: runIdRef.current, ok: false, error: "Körmotorn kunde inte starta." };
      setPreviousResult(lastResultRef.current);
      lastResultRef.current = failed;
      setResult(failed);
      setRunning(false);
    };
    const readyTimer = window.setTimeout(() => setWorkerReady(true), 0);
    return () => {
      window.clearTimeout(readyTimer);
      for (const pending of kernelRequests.values()) {
        window.clearTimeout(pending.timeout);
        pending.reject(new Error("Editor Kernel stängdes innan kommandot besvarades."));
      }
      kernelRequests.clear();
      worker.terminate();
    };
  }, []);

  const sendKernelCommand = useCallback((command: Record<string, unknown>) => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("Editor Kernel är inte startad."));
    requestIdRef.current += 1;
    const requestId = `request:${requestIdRef.current}`;
    return new Promise<KernelProtocolResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        kernelRequestsRef.current.delete(requestId);
        reject(new Error(`Editor Kernel svarade inte på ${String(command.type || "kommandot")}.`));
      }, 8_000);
      kernelRequestsRef.current.set(requestId, { resolve, reject, timeout });
      worker.postMessage({ ...command, requestId });
    });
  }, []);

  const execute = useCallback(() => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    kernelIntentRef.current += 1;
    const intent = kernelIntentRef.current;
    setRunning(true);
    const task = async () => {
      const obsolete = () => intent !== kernelIntentRef.current;
      const abandonObsoleteIntent = () => {
        if (!obsolete()) return false;
        kernelDocumentRef.current = null;
        latchedCancellationRef.current.delete(runId);
        return true;
      };
      const worker = workerRef.current;
      if (!worker) throw new Error("Editor Kernel är inte startad.");
      const documentFile = files.find((file) => file.kind === "document");
      if (!documentFile) throw new Error("Projektet saknar ett dokument att köra.");
      const fixture = playgroundFixtures.find((item) => item.id === fixtureId) ?? playgroundFixtures[0];
      const documentId = `doc:playground:${documentFile.path}`;
      let kernelDocument = kernelDocumentRef.current;
      const replaceSession = kernelReplaceSessionRef.current;
      if (replaceSession || !kernelDocument || kernelDocument.documentId !== documentId) {
        const opened = await sendKernelCommand({
          type: "open",
          replaceSession,
          document: { documentId, path: documentFile.path, source: documentFile.content, documentRevision: 1 },
        });
        if (abandonObsoleteIntent()) return;
        if (!opened.document) throw new Error("Editor Kernel returnerade inget dokument efter open.");
        kernelDocument = {
          documentId: opened.document.documentId,
          path: opened.document.path,
          source: documentFile.content,
          revision: opened.document.documentRevision,
          documentVersion: opened.document.documentVersion,
        };
        kernelDocumentRef.current = kernelDocument;
        await sendKernelCommand({
          type: "subscribe",
          documentId,
          subscriptionId: `subscription:${documentId}:system.out`,
          channels: ["system.out"],
        });
        if (abandonObsoleteIntent()) return;
        if (replaceSession) kernelReplaceSessionRef.current = false;
      } else if (kernelDocument.source !== documentFile.content) {
        const change = singleTextChange(kernelDocument.source, documentFile.content);
        const changed = await sendKernelCommand({
          type: "change",
          documentId,
          baseRevision: kernelDocument.revision,
          baseDocumentVersion: kernelDocument.documentVersion,
          changeSetId: `change:${documentId}:${kernelDocument.revision + 1}`,
          coordinateUnit: "unicode-code-point",
          changes: [change],
        });
        if (abandonObsoleteIntent()) return;
        if (!changed.document) throw new Error("Editor Kernel returnerade inget dokument efter change.");
        kernelDocument = {
          ...kernelDocument,
          source: documentFile.content,
          revision: changed.document.documentRevision,
          documentVersion: changed.document.documentVersion,
        };
        kernelDocumentRef.current = kernelDocument;
      }
      if (abandonObsoleteIntent()) return;
      requestIdRef.current += 1;
      worker.postMessage({
        type: "run",
        requestId: `request:${requestIdRef.current}`,
        runId,
        documentId,
        documentRevision: kernelDocument.revision,
        modules: files.filter((file) => file.kind === "module"),
        options: { fixtureId, strictChannels, semanticIdentity, adapters: ["org.textabana.result-summary", "org.textabana.data-table", "org.textabana.notebook", "org.textabana.annotation-review", "org.textabana.ml-lineage"] },
      });
      postedRunIdsRef.current.add(runId);
      if (latchedCancellationRef.current.delete(runId)) {
        worker.postMessage({ type: "cancel", runId, reason: "user-latched" });
      }
      if (fixture.conformance?.autoCancelAfterMs) {
        window.setTimeout(() => worker.postMessage({ type: "cancel", runId, reason: "fixture" }), fixture.conformance.autoCancelAfterMs);
      }
    };
    kernelCommandQueueRef.current = kernelCommandQueueRef.current.then(task, task).catch((error) => {
      if (intent !== kernelIntentRef.current) return;
      kernelDocumentRef.current = null;
      latchedCancellationRef.current.delete(runId);
      postedRunIdsRef.current.delete(runId);
      const message = error instanceof Error ? error.message : String(error);
      const failed = { ...emptyRuntimeResult, runId, ok: false, error: message };
      setPreviousResult(lastResultRef.current);
      lastResultRef.current = failed;
      setResult(failed);
      setRunning(false);
      toast.error(message);
    });
  }, [files, fixtureId, sendKernelCommand, strictChannels, semanticIdentity]);

  const cancelRun = useCallback(() => {
    if (!running || !workerRef.current) return;
    const runId = runIdRef.current;
    if (!postedRunIdsRef.current.has(runId)) latchedCancellationRef.current.add(runId);
    workerRef.current.postMessage({ type: "cancel", runId, reason: "user" });
    toast.info("Avbrytning begärd vid nästa kooperativa stage-gräns");
  }, [running]);

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
    kernelIntentRef.current += 1;
    kernelReplaceSessionRef.current = true;
    setFixtureId(nextFixtureId);
    setFiles(filesForFixture(nextFixtureId));
    setActivePath("document.md");
    setPreviousResult(null);
    lastResultRef.current = null;
    kernelDocumentRef.current = null;
    toast.success(`Fixture laddad: ${playgroundFixtures.find((fixture) => fixture.id === nextFixtureId)?.title ?? nextFixtureId}`);
  };

  const resetProject = () => {
    if (!window.confirm("Återställ aktuell fixture och alla moduler?")) return;
    kernelIntentRef.current += 1;
    kernelReplaceSessionRef.current = true;
    setFiles(filesForFixture(fixtureId));
    setActivePath("document.md");
    setPreviousResult(null);
    lastResultRef.current = null;
    kernelDocumentRef.current = null;
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
              <TabsTrigger value="docs"><BookOpen /> Specifikation 0.7</TabsTrigger>
              <TabsTrigger value="workspace"><Code2 /> Playground Labs</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="top-actions">
            {view === "workspace" && (
              <>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={resetProject} aria-label="Återställ exempel"><RotateCcw /></Button></TooltipTrigger><TooltipContent>Återställ exempel</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={copyOutput} disabled={!result.ok} aria-label="Kopiera resultat"><Copy /></Button></TooltipTrigger><TooltipContent>Kopiera resultat</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" onClick={downloadOutput} disabled={!result.ok} aria-label="Ladda ner resultat"><Download /></Button></TooltipTrigger><TooltipContent>Ladda ner Markdown</TooltipContent></Tooltip>
                {running
                  ? <Button size="sm" variant="outline" onClick={cancelRun}><Square /> Avbryt</Button>
                  : <Button size="sm" onClick={execute}><Play /> Kör</Button>}
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
                <button type="button" role="tab" aria-selected={lab === "kernel"} className={lab === "kernel" ? "is-active" : ""} onClick={() => setLab("kernel")}>
                  <PanelsTopLeft /><span><strong>Editor Kernel</strong><small>open, change, run och metadata-delta</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "editor"} className={lab === "editor" ? "is-active" : ""} onClick={() => setLab("editor")}>
                  <PanelRight /><span><strong>Editor Metadata</strong><small>Gutter, anchors och SourceMap</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "channels"} className={lab === "channels" ? "is-active" : ""} onClick={() => setLab("channels")}>
                  <RadioTower /><span><strong>Channel & Result</strong><small>Descriptors, atomiskt resultat och adapters</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "data"} className={lab === "data" ? "is-active" : ""} onClick={() => setLab("data")}>
                  <Database /><span><strong>Data & Lineage</strong><small>Typade records, join och källspårning</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "notebook"} className={lab === "notebook" ? "is-active" : ""} onClick={() => setLab("notebook")}>
                  <NotebookTabs /><span><strong>Notebook Interop</strong><small>Celler, MIME, state och stale output</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "annotation"} className={lab === "annotation" ? "is-active" : ""} onClick={() => setLab("annotation")}>
                  <Bot /><span><strong>Annotation & Review</strong><small>AI-kandidater, revisioner och export</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "conformance"} className={lab === "conformance" ? "is-active" : ""} onClick={() => setLab("conformance")}>
                  <ShieldCheck /><span><strong>Conformance</strong><small>Profiler, krav, golden diff och grind</small></span>
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
                <label className="strict-control">
                  <Switch size="sm" checked={semanticIdentity} onCheckedChange={setSemanticIdentity} aria-label="Beräkna SHA-256-identiteter" />
                  <span>SHA-256-identiteter</span>
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
                <ResizablePanel defaultSize="50%" minSize="30%"><PlaygroundOutput lab={lab} result={result} previousResult={previousResult} running={running} onOpenLab={setLab} onSelectFixture={selectFixture} /></ResizablePanel>
              </ResizablePanelGroup>
            </div>

            <div className="mobile-workspace">
              <div className="mobile-switch">
                <button className={mobilePane === "editor" ? "is-active" : ""} onClick={() => setMobilePane("editor")}>Källa</button>
                <button className={mobilePane === "preview" ? "is-active" : ""} onClick={() => setMobilePane("preview")}>Resultat</button>
              </div>
              {mobilePane === "editor" ? (
                <section className="editor-shell"><div className="panel-bar"><div className="panel-title">{activeFile.path}</div></div><div className="editor-area"><CodeEditor file={activeFile} onChange={updateActiveFile} /></div></section>
              ) : <PlaygroundOutput lab={lab} result={result} previousResult={previousResult} running={running} onOpenLab={setLab} onSelectFixture={selectFixture} />}
            </div>
          </main>
        ) : <Specification />}

        <footer className="statusbar">
          <span><CheckCircle2 /> Interop draft 0.7 · Language 0.4 · Parser/CST/AST lab-v1 · typed IR lab-v2</span>
          <span className="syntax-hint"><code>change</code> snapshot <ChevronRight /><code>run</code> result <ChevronRight /><code>delta</code></span>
          <span>Source-first · Typed · Positionsmedveten</span>
        </footer>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
