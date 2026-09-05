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
  Database,
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
  {
    id: "data-join",
    title: "Data join",
    summary: "Två Markdown-tabeller blir typade records, en deterministisk inner join och spårbar JSON-tabell.",
    document: dataJoinFixtureDocument,
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

const initialFiles: ProjectFile[] = [
  { path: "document.md", kind: "document", content: sampleDocument },
  { path: "modules/core.js", kind: "module", content: coreModule },
  { path: "modules/editorial.js", kind: "module", content: editorialModule },
  { path: "modules/base64.js", kind: "module", content: base64Module },
  { path: "modules/metadata.js", kind: "module", content: metadataModule },
  { path: "modules/data.js", kind: "module", content: dataModule },
];

const storageKey = "textabana-project-v7-data-lineage";

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
  adapterRun: null,
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
        adapterRun: event.data.adapterRun ?? null,
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
      options: { strictChannels, adapters: ["org.textabana.result-summary", "org.textabana.data-table"] },
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
              <TabsTrigger value="docs"><BookOpen /> Specifikation 0.5</TabsTrigger>
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
                  <RadioTower /><span><strong>Channel & Result</strong><small>Descriptors, atomiskt resultat och adapters</small></span>
                </button>
                <button type="button" role="tab" aria-selected={lab === "data"} className={lab === "data" ? "is-active" : ""} onClick={() => setLab("data")}>
                  <Database /><span><strong>Data & Lineage</strong><small>Typade records, join och källspårning</small></span>
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
          <span><CheckCircle2 /> Interop draft 0.5 · Language 0.4 · Adapter + Data lab-v1</span>
          <span className="syntax-hint"><code>source</code> IR <ChevronRight /><code>run</code> result <ChevronRight /><code>adapters</code></span>
          <span>Source-first · Typed · Positionsmedveten</span>
        </footer>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
