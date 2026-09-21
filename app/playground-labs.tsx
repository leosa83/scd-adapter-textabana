"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ParserDiagnostic } from "./parser-diagnostic";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Braces,
  CheckCircle2,
  CircleDot,
  Code2,
  Database,
  FileJson,
  Fingerprint,
  GitBranch,
  Layers3,
  MapPin,
  NotebookTabs,
  PanelRight,
  PanelsTopLeft,
  RadioTower,
  Rows3,
  ShieldCheck,
  Sparkles,
  Table2,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  ChannelEvent,
  ExecutionStep,
  LabId,
  RuntimeAnchor,
  ConformanceProfile,
  RuntimeResult,
} from "./playground-model";

type PlaygroundOutputProps = {
  lab: LabId;
  result: RuntimeResult;
  previousResult: RuntimeResult | null;
  running: boolean;
  onOpenLab: (lab: LabId) => void;
  onSelectFixture: (fixtureId: string) => void;
};

const labCopy: Record<LabId, { title: string; icon: typeof Braces }> = {
  language: { title: "Language & Scope", icon: Braces },
  kernel: { title: "Editor Kernel", icon: PanelsTopLeft },
  editor: { title: "Editor Metadata", icon: PanelRight },
  channels: { title: "Channel & Result", icon: RadioTower },
  data: { title: "Data & Lineage", icon: Database },
  notebook: { title: "Notebook Interop", icon: NotebookTabs },
  annotation: { title: "Annotation & Review", icon: Bot },
  conformance: { title: "Conformance", icon: ShieldCheck },
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function ResultShell({
  lab,
  result,
  running,
  children,
}: Pick<PlaygroundOutputProps, "lab" | "result" | "running"> & { children: React.ReactNode }) {
  const Icon = labCopy[lab].icon;
  return (
    <section className="preview-shell lab-result-shell" lang="en" aria-label={`${labCopy[lab].title} result`}>
      <div className="panel-bar" lang="en">
        <div className="panel-title"><Icon aria-hidden="true" />{labCopy[lab].title}</div>
        <span className={`runtime-state ${result.ok ? "is-ok" : "is-error"}`} aria-live="polite">
          <span />
          {running ? "Compiling" : result.ok ? `Run ${result.runId ?? "–"} · committed` : result.cancelled ? "Run cancelled" : "Run failed"}
        </span>
      </div>
      {!result.ok ? (
        <div className="error-state lab-error-banner" role="alert" lang="en">
          <div className="error-icon"><AlertTriangle aria-hidden="true" /></div>
          <div>
            <p className="error-kicker">{result.cancelled ? "Run cancelled atomically" : "The run committed no domain result"}</p>
            <h3>{result.error}</h3>
            <p>{result.diagnostics[0]?.code ?? "TBA-RUN-LAB"} · committed render and channels are empty.</p>
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

function LabTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ id: string; label: string; count?: number; icon?: typeof Braces }>;
}) {
  return (
    <div className="output-tabs lab-tabs" role="tablist" aria-label="Inspection view">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={value === item.id}
            className={value === item.id ? "is-active" : ""}
            onClick={() => onChange(item.id)}
            key={item.id}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            {item.label}
            {item.count !== undefined ? <small>{item.count}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function RenderView({ output }: { output: string }) {
  return (
    <div className="preview-scroll">
      <article className="rendered-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
      </article>
    </div>
  );
}

function StageFlow({ steps, compact = false }: { steps: ExecutionStep[]; compact?: boolean }) {
  if (!steps.length) return <div className="lab-empty">No function stages ran for this source.</div>;
  return (
    <ol className={compact ? "stage-flow is-compact" : "stage-flow"}>
      {steps.map((step) => (
        <li key={`${step.step}:${step.stageId}`}>
          <span className="stage-sequence">{step.step}</span>
          <div className="stage-card">
            <div className="stage-card-head">
              <strong>{step.function}</strong>
              <span className={`stage-modality is-${step.modality}`}>{step.modality}</span>
              <span className={`stage-modality ${step.functionInvoked === false ? "is-interval" : ""}`}>
                {step.functionInvoked === false ? "cache reuse" : "fresh"}
              </span>
              {step.scopeId ? <code>@{step.scopeId}</code> : null}
              <small>line {step.source.startLine}{step.source.endLine !== step.source.startLine ? `–${step.source.endLine}` : ""}</small>
            </div>
            {!compact ? (
              <div className="stage-io">
                <div><span>input</span><code>{step.input.preview || "∅"}</code><small>{step.input.hash}</small></div>
                <ArrowRight aria-hidden="true" />
                <div><span>output</span><code>{step.output.preview || "∅"}</code><small>{step.output.hash}</small></div>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function LanguageLab({ result }: { result: RuntimeResult }) {
  const [tab, setTab] = useState("semantics");
  const ir = result.inspection;
  const scopes = ir?.scopes ?? [];
  const blocks = ir?.blocks ?? [];
  const steps = result.executionTrace ?? [];
  const graphNodes = result.plan?.graph.nodes ?? [];
  const graphStages = graphNodes.filter((node) => node.kind === "stage");
  const graphEdges = result.plan?.graph.edges ?? [];
  const invalidation = result.invalidationPreview;
  const executionReport = result.executionReport;
  const executionStats = result.executionStats;
  const scheduling = executionReport?.scheduling;
  const resources = executionReport?.resources;
  const graphStageById = new Map(graphStages.map((node) => [node.nodeId, node]));
  const affectedNodeCount = new Set([
    ...(invalidation?.directlyAffectedNodeIds ?? []),
    ...(invalidation?.transitivelyAffectedNodeIds ?? []),
    ...(invalidation?.forcedEffectNodeIds ?? []),
  ]).size;
  const recoveries = ir?.nodes.filter((node) => node.kind === "Recovery") ?? [];
  const parserDiagnostics = ir?.diagnostics ?? result.diagnostics.filter((diagnostic) => diagnostic.phase === "parsing");

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "semantics", label: "Semantics", count: scopes.length + blocks.length, icon: Layers3 },
          { id: "parser", label: "Parser", count: recoveries.length, icon: Rows3 },
          { id: "graph", label: "Graph", count: graphStages.length, icon: GitBranch },
          { id: "trace", label: "Execution trace", count: steps.length, icon: Workflow },
          { id: "ir", label: "IR projection", icon: FileJson },
          { id: "render", label: "Render", icon: Sparkles },
        ]}
      />
      {tab === "render" ? <RenderView output={result.output} /> : null}
      {tab === "ir" ? (
        <div className="lab-json-scroll">
          <div className="subset-notice"><CircleDot /> Typed runtime projection · <code>textabana.ir/lab-v2</code> · not full profile conformance</div>
          <pre>{json(ir)}</pre>
        </div>
      ) : null}
      {tab === "parser" ? (
        <div className="lab-scroll parser-overview">
          <div className="lab-metrics">
            <article><span>Parser</span><strong>{ir?.parser.engine ?? "–"}</strong><small>{ir?.parser.schema ?? "no analysis"}</small></article>
            <article><span>Parse mode</span><strong>{ir?.parser.parseMode ?? "–"}</strong><small>incremental reuse: {ir?.parser.incrementalReuse ? "yes" : "no"}</small></article>
            <article><span>CST</span><strong>{ir?.syntax.cst.nodes.length ?? 0}</strong><small>{ir?.syntax.cst.lossless ? "lossless source coverage" : "incomplete coverage"}</small></article>
            <article><span>Recovery</span><strong>{recoveries.length}</strong><small>{ir?.validity.executable ? "executable IR" : "all execution blocked"}</small></article>
          </div>
          <div className={`subset-notice ${ir?.validity.executable ? "" : "is-warning"}`}>
            {ir?.validity.executable ? <CheckCircle2 /> : <AlertTriangle />}
            CST → AST → typed IR · Unicode code point spans · recovery nodes never execute
          </div>
          {parserDiagnostics.length ? (
            <div className="parser-diagnostics">
              {parserDiagnostics.map((diagnostic) => (
                <ParserDiagnostic key={diagnostic.diagnosticId ?? `${diagnostic.code}:${diagnostic.line}`} diagnostic={diagnostic} recovery={recoveries.find((node) => node.nodeId === diagnostic.recoveryNodeId)} parserSchema={ir?.parser.schema} />
              ))}
            </div>
          ) : (
            <div className="lab-empty"><CheckCircle2 /> No parse diagnostics in the current source snapshot.</div>
          )}
          <div className="lab-json-scroll parser-json">
            <pre>{json({ parser: ir?.parser, validity: ir?.validity, recoveries, cst: ir?.syntax.cst, ast: ir?.syntax.ast })}</pre>
          </div>
        </div>
      ) : null}
      {tab === "graph" ? (
        <div className="lab-scroll">
          <div className="lab-intro">
            <div><span>Post-module-init · pre-transform</span><strong>{result.plan?.graph.schema ?? "No graph"}</strong></div>
            <p>The graph governs execution. Independent trusted, effects-free branches can overlap asynchronously in one Worker; publication still follows plan order.</p>
          </div>
          {result.plan ? (
            <>
              <div className="lab-metrics">
                <article><span>Nodes</span><strong>{graphNodes.length}</strong><small>source · stage · merge · render</small></article>
                <article><span>Typed edges</span><strong>{graphEdges.length}</strong><small>acyclic topological order</small></article>
                <article><span>Planned dirty nodes</span><strong>{affectedNodeCount}</strong><small>{invalidation?.mode ?? "no baseline"} · forced {invalidation?.forcedEffectNodeIds.length ?? 0}</small></article>
                <article><span>Fresh / reuse</span><strong>{executionStats.executed} / {executionStats.reused}</strong><small>{executionStats.hits} hits · {executionStats.misses} misses · {executionStats.writes} committed cache changes</small></article>
              </div>
              <div className="lab-metrics">
                <article><span>Scheduler</span><strong>{scheduling?.mode ?? "–"}</strong><small>{scheduling?.hostMode ?? "no runtime report"}</small></article>
                <article><span>Waves / peak</span><strong>{scheduling?.waveCount ?? 0} / {scheduling?.peakConcurrency ?? 0}</strong><small>max {scheduling?.maxConcurrency ?? 0} concurrent invocations</small></article>
                <article><span>Serial barriers</span><strong>{scheduling?.barrierNodeRefs.length ?? 0}</strong><small>unknown · stateful · effectful</small></article>
                <article><span>Run budget</span><strong>{resources?.status ?? "–"}</strong><small>{resources?.usage.resolvedStageResolutions ?? 0}/{resources?.effective.maxStageResolutions ?? 0} stages · {resources?.usage.renderBytes ?? 0} bytes</small></article>
              </div>
              <div className="subset-notice"><CircleDot /> {executionReport?.transactionState ?? "no cache transaction"} · bounded async overlap · deterministic plan-order commit · two distinct committed revisions before reuse</div>
              {scheduling?.waves.length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Wave</th><th>Mode</th><th>Nodes</th><th>Fresh / reuse</th><th>Commit</th></tr></thead>
                    <tbody>
                      {scheduling.waves.map((wave) => (
                        <tr key={wave.waveId}>
                          <th><code>{wave.waveId}</code></th>
                          <td>{wave.mode}</td>
                          <td>{wave.nodeRefs.length}</td>
                          <td>{wave.freshNodeRefs.length} / {wave.reusedNodeRefs.length}</td>
                          <td><code>{wave.commitOrder}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {executionReport?.nodeResolutions.length ? (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Stage</th><th>Outcome</th><th>Lookup</th><th>Evidence</th><th>Reason</th></tr></thead>
                    <tbody>
                      {executionReport.nodeResolutions.map((resolution) => (
                        <tr key={resolution.planNodeRef}>
                          <th><code>{graphStageById.get(resolution.planNodeRef)?.function ?? resolution.planNodeRef}</code></th>
                          <td>{resolution.disposition}</td>
                          <td>{resolution.lookup}</td>
                          <td>{resolution.cache.evidence} · {resolution.cache.verification}</td>
                          <td><code>{resolution.reason}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <div className="lab-json-scroll parser-json">
                <pre>{json({ plan: result.plan, invalidationPreview: invalidation, executionReport })}</pre>
              </div>
              <div className="unsupported-strip"><AlertTriangle /> One Worker · async overlap only · no multicore execution, continuous stage streaming, general sink backpressure, synchronous preemption or hard CPU/memory quota</div>
            </>
          ) : (
            <div className="lab-empty"><AlertTriangle /> No graph — the compile gate or module binding blocked planning.</div>
          )}
        </div>
      ) : null}
      {tab === "trace" ? (
        <div className="lab-scroll">
          <div className="lab-intro">
            <div><span>Observed stage resolution</span><strong>{steps.length} stages · {executionStats.executed} transforms · {executionStats.reused} reuse</strong></div>
            <p>Each started stage receives a trace entry in plan order, never completion order. <code>functionInvoked</code> distinguishes a transform call from cache materialization.</p>
          </div>
          <StageFlow steps={steps} />
          {(result.plan?.unsupported.length ?? 0) > 0 ? (
            <div className="unsupported-strip"><AlertTriangle /> Defined but not yet supported: {result.plan?.unsupported.join(" · ")}</div>
          ) : null}
          <div className="unsupported-strip"><AlertTriangle /> Single-Worker async overlap · no continuous stage streaming, general sink backpressure, synchronous preemption or hard CPU/memory quota</div>
        </div>
      ) : null}
      {tab === "semantics" ? (
        <div className="lab-scroll language-overview">
          <div className="lab-metrics">
            <article><span>Intervals</span><strong>{scopes.length}</strong><small>ordering {ir?.configuration.scopeOrder ?? "–"}</small></article>
            <article><span>Block</span><strong>{blocks.length}</strong><small>strict nesting</small></article>
            <article><span>Stage resolutions</span><strong>{steps.length}</strong><small>fresh + materialized</small></article>
            <article><span>Syntax nodes</span><strong>{ir?.nodes.length ?? 0}</strong><small>source projection</small></article>
          </div>

          <section className="semantic-section">
            <div className="semantic-section-title"><GitBranch /><div><strong>Open intervals</strong><span>Identity, order and segments</span></div></div>
            <div className="scope-cards">
              {scopes.map((scope) => (
                <article key={scope.scopeId}>
                  <div><strong>{scope.name}</strong><code>@id={scope.id}</code></div>
                  <span className="scope-order">order {scope.order}</span>
                  <p>Opens at line {scope.openLine} · closes at {scope.closeLine ? `line ${scope.closeLine}` : "no closing line"}</p>
                  <small>{scope.segments.map((segment) => `L${segment.startLine}–${segment.endLine}`).join(" · ") || "Inget textsegment"}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="semantic-section">
            <div className="semantic-section-title"><Code2 /><div><strong>Blocks and inheritance</strong><span>The block pipeline runs before ambient inheritance</span></div></div>
            <div className="block-cards">
              {blocks.map((block) => (
                <article key={block.blockId}>
                  <div className="block-card-head"><strong>{block.name}</strong><span>L{block.openLine}–{block.closeLine ?? "?"}</span></div>
                  <div className="pipeline-line">
                    {block.pipeline.map((stage, index) => (
                      <span key={`${block.blockId}:${stage.stage}:${stage.name}`}>
                        {index > 0 ? <ArrowRight aria-hidden="true" /> : null}<code>{stage.name}</code>
                      </span>
                    ))}
                  </div>
                  <p><code>@inherit={block.inherit}</code> · <code>@cross={block.cross}</code> · {block.activeScopeIds.length} ambient scopes</p>
                </article>
              ))}
            </div>
          </section>

          <section className="semantic-section">
            <div className="semantic-section-title"><Workflow /><div><strong>How were stages resolved?</strong><span>The same observed resolution trace is detailed in Execution trace</span></div></div>
            <StageFlow steps={steps} compact />
          </section>
        </div>
      ) : null}
    </>
  );
}

function EventCard({ event, selected, onSelect }: { event: ChannelEvent; selected?: boolean; onSelect?: () => void }) {
  const content = (
    <>
      <div className="channel-event-head">
        <span className="event-sequence">#{event.sequence}</span>
        <span className="event-channel">{event.channel}</span>
        <span className="event-position"><Rows3 /> {event.target.mode} {event.target.mode === "row" ? event.row : event.line}</span>
        <span className={`mapping-badge is-${event.source.mapping}`}>{event.source.mapping}</span>
        <code>{event.origin.function}</code>
      </div>
      <pre>{typeof event.payload === "string" ? event.payload : json(event.payload)}</pre>
      <div className="channel-event-foot">
        <span><strong>anchor</strong> {event.target.anchorRef}</span>
        <span><strong>source</strong> {event.source.path}:{event.line}</span>
        <span><strong>state</strong> {event.state}</span>
      </div>
    </>
  );
  return onSelect ? (
    <button type="button" className={`channel-event event-button ${selected ? "is-selected" : ""}`} onClick={onSelect}>{content}</button>
  ) : <article className="channel-event">{content}</article>;
}

function editorItemLabel(item: { target?: { rowId?: string }; payload?: unknown }) {
  if (item.payload && typeof item.payload === "object" && "text" in item.payload) return String(item.payload.text);
  return item.target?.rowId || "metadata";
}

function EditorKernelLab({
  result,
  onOpenLab,
  onSelectFixture,
}: Pick<PlaygroundOutputProps, "result" | "onOpenLab" | "onSelectFixture">) {
  const [tab, setTab] = useState("revision");
  const kernel = result.editorKernel;
  const delta = kernel?.metadataDelta ?? null;
  const changedCount = delta ? delta.summary.added + delta.summary.removed + delta.summary.changed + delta.summary.moved : 0;

  if (!kernel) {
    return (
      <div className="lab-empty kernel-empty">
        <PanelsTopLeft aria-hidden="true" />
        <strong>This run has no Editor Kernel evidence.</strong>
        <p>Open the versioned fixture to run <code>open → subscribe → change → run</code>. The kernel also supports read-only <code>analyze</code> between changes.</p>
        <Button size="sm" onClick={() => onSelectFixture("editor-kernel-revisions")}>Load Kernel revisions</Button>
      </div>
    );
  }

  const session = kernel.session;
  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "revision", label: "Revision", icon: GitBranch },
          { id: "delta", label: "Metadata delta", count: changedCount, icon: Rows3 },
          { id: "anchors", label: "Anchor continuity", count: delta?.anchorContinuity.transitions.length, icon: MapPin },
          { id: "protocol", label: "Protocol JSON", icon: FileJson },
        ]}
      />
      {tab === "revision" ? (
        <div className="lab-scroll kernel-lab">
          <div className="subset-notice"><CircleDot /> Executable <code>editor-kernel/lab-v1</code> · read-only analyze + recovery · compiler snapshot and valid Lezer fragment reuse</div>
          <div className="lab-intro">
            <div><span>Open document session</span><strong>{session?.path ?? "document.md"} · revision {session?.documentRevision ?? "–"}</strong></div>
            <p>An accepted text patch advances the document head. Metadata becomes current only after a successful atomic run.</p>
          </div>
          <div className="lab-metrics kernel-metrics">
            <article><span>Document head</span><strong>{session?.documentRevision ?? "–"}</strong><small>{session?.documentVersion ?? "no version"}</small></article>
            <article><span>Published revision</span><strong>{session?.publishedRevision ?? "–"}</strong><small>{kernel.run.committed ? "current" : "last successful revision retained"}</small></article>
            <article><span>Latest change</span><strong>{kernel.change?.status ?? "open"}</strong><small>{kernel.change ? `${kernel.change.baseRevision} → ${kernel.change.documentRevision}` : "initial snapshot"}</small></article>
            <article><span>Metadata changes</span><strong>{changedCount}</strong><small>{delta?.mode ?? "no subscription"}</small></article>
          </div>
          <section className="kernel-flow" aria-label="Editor Kernel protocol trace">
            {(kernel.trace ?? []).map((entry, index) => (
              <article key={`${String(entry.command)}:${index}`}>
                <span>{String(entry.direction ?? "kernel")}</span>
                <strong>{String(entry.command ?? "event")}</strong>
                <code>{String(entry.status ?? "")}</code>
              </article>
            ))}
          </section>
          <CalloutLike>
            <strong>Separate forms of incrementality</strong>
            <p>ChangeSets update source and committed deltas update metadata. Valid Lezer fragments and exact compiler snapshots can be reused; the graph is built per run, with verified stage-cache reuse where eligible.</p>
          </CalloutLike>
          <div className="kernel-actions">
            <Button size="sm" variant="outline" onClick={() => onSelectFixture("editor-kernel-revisions")}><GitBranch /> Load revision fixture</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenLab("editor")}><PanelRight /> Show current metadata</Button>
          </div>
        </div>
      ) : null}
      {tab === "delta" ? (
        <div className="lab-scroll kernel-delta-view">
          <div className="lab-intro"><div><span>{delta?.cursor ?? "No cursor"}</span><strong>{delta?.mode === "initial-snapshot" ? "Initial snapshot" : delta?.state === "committed" ? "Committed metadata delta" : "No new commit"}</strong></div><p>Matching uses stable metadata identity; run-local event ids and sequence are ignored.</p></div>
          {!delta ? <div className="lab-empty">No channel subscription delivered a delta for this run.</div> : (
            <>
              <div className="delta-summary-grid">
                {(["added", "moved", "changed", "removed", "unchanged"] as const).map((kind) => <article className={`is-${kind}`} key={kind}><span>{kind}</span><strong>{delta.summary[kind]}</strong></article>)}
              </div>
              {delta.mode === "not-committed" ? <div className="error-state compact"><AlertTriangle /><p>The revision was not published. The previous successful delta baseline was unchanged.</p></div> : null}
              <div className="delta-list">
                {delta.collections.added.map((item) => <article key={`added:${item.identity}`} className="is-added"><span>added</span><strong>{item.target.rowId}</strong><p>{editorItemLabel(item)}</p><small>line {item.target.line} · {item.channel}</small></article>)}
                {delta.collections.moved.map((item) => <article key={`moved:${item.identity}`} className="is-moved"><span>moved</span><strong>{item.after.target.rowId}</strong><p>{editorItemLabel(item.after)}</p><small>line {item.before.target.line} → {item.after.target.line} · stable identity</small></article>)}
                {delta.collections.changed.map((item) => <article key={`changed:${item.identity}`} className="is-changed"><span>changed</span><strong>{item.after.target.rowId}</strong><p><del>{editorItemLabel(item.before)}</del><br />{editorItemLabel(item.after)}</p><small>{item.positionChanged ? `payload + position · line ${item.before.target.line} → ${item.after.target.line}` : "payload changed"}</small></article>)}
                {delta.collections.removed.map((item) => <article key={`removed:${item.identity}`} className="is-removed"><span>removed</span><strong>{item.target.rowId}</strong><p>{editorItemLabel(item)}</p><small>previous line {item.target.line}</small></article>)}
              </div>
              {changedCount === 0 ? <div className="lab-empty">The revision produced the same semantic metadata. The source text may still have changed.</div> : null}
            </>
          )}
        </div>
      ) : null}
      {tab === "anchors" ? (
        <div className="lab-scroll kernel-anchor-view">
          <div className="lab-intro"><div><span>Cross-revision resolution</span><strong>Stable ID first, then unique quote + origin</strong></div><p><code>ambiguous</code> and <code>orphaned</code> never select a candidate silently.</p></div>
          <div className="delta-summary-grid anchor-summary-grid">
            {Object.entries(delta?.anchorContinuity.summary ?? {}).map(([status, count]) => <article key={status} className={`is-${status}`}><span>{status}</span><strong>{count}</strong></article>)}
          </div>
          <div className="anchor-transition-list">
            {(delta?.anchorContinuity.transitions ?? []).map((transition, index) => {
              const before = transition.from as { anchorRef?: string; line?: number; quote?: string } | null;
              const after = transition.to as { anchorRef?: string; line?: number; quote?: string } | null;
              return <article key={`${transition.status}:${before?.anchorRef ?? after?.anchorRef ?? index}`}><span className={`is-${transition.status}`}>{transition.status}</span><div><strong>{before?.quote ?? after?.quote ?? "New or unresolved anchor"}</strong><p>{transition.method} · line {before?.line ?? "–"} → {after?.line ?? "–"}</p></div><code>{Math.round(transition.confidence * 100)}%</code></article>;
            })}
          </div>
        </div>
      ) : null}
      {tab === "protocol" ? (
        <div className="lab-json-scroll kernel-json-view">
          <div className="subset-notice"><CircleDot /> Machine-readable editor evidence · <code>canonical=false</code> · not full <code>editor-kernel/1</code>conformance</div>
          <pre>{json(kernel)}</pre>
        </div>
      ) : null}
    </>
  );
}

function CalloutLike({ children }: { children: React.ReactNode }) {
  return <aside className="kernel-callout"><Workflow aria-hidden="true" /><div>{children}</div></aside>;
}

function EditorLab({
  result,
  previousResult,
  onOpenLab,
}: Pick<PlaygroundOutputProps, "result" | "previousResult" | "onOpenLab">) {
  const [tab, setTab] = useState("editor");
  const events = useMemo(() => result.channels["system.out"] ?? [], [result.channels]);
  const previousEvents = useMemo(() => previousResult?.channels["system.out"] ?? [], [previousResult]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const anchor = selected ? result.anchors.find((item) => item.anchorId === selected.target.anchorRef) ?? null : null;
  const previousByRowId = useMemo(() => new Map(previousEvents.map((event) => [event.rowId, event])), [previousEvents]);
  const eventState = (event: ChannelEvent) => {
    const before = previousByRowId.get(event.rowId);
    if (!before) return "new";
    return before.line === event.line ? "exact" : "re-anchored";
  };
  const moved = events.filter((event) => eventState(event) === "re-anchored").length;
  const orphaned = previousEvents.filter((event) => !events.some((current) => current.rowId === event.rowId)).length;

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "editor", label: "Editorprojektion", count: events.length, icon: PanelRight },
          { id: "events", label: "system.out", count: events.length, icon: Rows3 },
          { id: "maps", label: "Anchors & SourceMap", count: result.anchors.length, icon: MapPin },
        ]}
      />
      {tab === "events" ? (
        <div className="channel-scroll">
          <div className="lab-intro"><div><span>Reserved channel</span><strong>system.out</strong></div><p><code>kind</code> defines semantics; <code>target.mode</code> is row or line.</p></div>
          <div className="channel-events">{events.map((event) => <EventCard event={event} key={event.id} />)}</div>
        </div>
      ) : null}
      {tab === "maps" ? (
        <div className="lab-json-scroll split-json">
          <section><h3>Anchors</h3><pre>{json(result.anchors)}</pre></section>
          <section><h3>SourceMap records</h3><pre>{json(result.sourceMaps)}</pre></section>
        </div>
      ) : null}
      {tab === "editor" ? (
        <div className="metadata-lab">
          <div className="metadata-summary">
            <span><CheckCircle2 /> {events.length} current</span>
            <span><GitBranch /> {moved} moved</span>
            <span className={orphaned ? "has-warning" : ""}><AlertTriangle /> {orphaned} orphaned</span>
            <small>Compared with the previous run on this device</small>
          </div>
          <div className="metadata-workbench">
            <div className="source-projection" aria-label="Source with metadata gutter">
              {(result.inspection?.sourceLines ?? []).map((sourceLine) => {
                const lineEvents = events.filter((event) => event.line === sourceLine.line);
                return (
                  <div className={`source-projection-line is-${sourceLine.kind}`} key={sourceLine.line}>
                    <span className="source-line-number">{sourceLine.line}</span>
                    <span className="source-line-markers">
                      {lineEvents.map((event) => (
                        <button
                          type="button"
                          key={event.id}
                          className={`metadata-marker is-${event.target.mode} ${selected?.id === event.id ? "is-selected" : ""}`}
                          onClick={() => setSelectedId(event.id)}
                          aria-label={`Open ${event.kind} on line ${event.line}`}
                        >
                          {event.target.mode === "row" ? <Rows3 /> : <MapPin />}
                        </button>
                      ))}
                    </span>
                    <code>{sourceLine.text || " "}</code>
                    {lineEvents[0] ? <span className={`reanchor-state is-${eventState(lineEvents[0])}`}>{eventState(lineEvents[0])}</span> : null}
                  </div>
                );
              })}
            </div>
            <aside className="metadata-detail">
              {selected ? (
                <>
                  <div className="metadata-detail-head"><span>{selected.kind}</span><strong>{selected.rowId}</strong></div>
                  <dl>
                    <div><dt>Target</dt><dd>{selected.target.mode} · line {selected.line} · row {selected.row}</dd></div>
                    <div><dt>Mapping</dt><dd>{selected.source.mapping}</dd></div>
                    <div><dt>Anchor</dt><dd><code>{selected.target.anchorRef}</code></dd></div>
                    <div><dt>Origin</dt><dd>{selected.origin.function} · {selected.origin.modality}</dd></div>
                    <div><dt>Revision</dt><dd>{eventState(selected)}</dd></div>
                  </dl>
                  <h4>Payload</h4>
                  <pre>{json(selected.payload)}</pre>
                  {anchor ? <AnchorSummary anchor={anchor} /> : null}
                  <Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Open event stream</Button>
                </>
              ) : <div className="lab-empty">Run a fixture that emits to system.out.</div>}
            </aside>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AnchorSummary({ anchor }: { anchor: RuntimeAnchor }) {
  const quote = anchor.selectors.find((selector) => selector.type === "TextQuoteSelector");
  return (
    <div className="anchor-summary">
      <h4>Anchor selectors</h4>
      <code>{String(quote?.exact ?? "") || "Empty source line"}</code>
      <small>{anchor.target.version} · Unicode code points</small>
    </div>
  );
}

function AdapterRunView({ result }: { result: RuntimeResult }) {
  const adapterRun = result.adapterRun;
  if (!adapterRun) return <div className="lab-empty">No adapter run exists for this result.</div>;
  const executable = adapterRun.manifests.filter((manifest) => manifest.support === "playground-subset");
  const contractOnly = adapterRun.manifests.filter((manifest) => manifest.support === "contract-only");

  return (
    <div className="lab-scroll adapter-contract-view">
      <div className="subset-notice">
        <CircleDot /> Post-commit fan-out · <code>adapter-contract/1</code> playground-subset · canonical Result is not mutated
      </div>
      <div className="lab-metrics">
        <article><span>Adapter run</span><strong>{adapterRun.status}</strong><small>{adapterRun.verification.immutable ? "immutable verified" : "mutation detected"}</small></article>
        <article><span>Executable</span><strong>{executable.length}</strong><small>executable projections</small></article>
        <article><span>Contract-only</span><strong>{contractOnly.length}</strong><small>no simulated output</small></article>
        <article><span>Projections</span><strong>{adapterRun.projections.length}</strong><small>separate from Result</small></article>
      </div>

      <section className="adapter-section">
        <div className="semantic-section-title"><Braces /><div><strong>Adapter registry</strong><span>Version, profile, capabilities and fidelity are declared before execution</span></div></div>
        <div className="adapter-manifest-grid">
          {adapterRun.manifests.map((manifest) => (
            <article key={manifest.adapterId} className={`adapter-manifest is-${manifest.support}`}>
              <div className="adapter-manifest-head">
                <span className="adapter-support">{manifest.support}</span>
                <code>{manifest.version}</code>
              </div>
              <strong>{manifest.adapterId}</strong>
              <p>{manifest.profile} · {manifest.phase} · {manifest.execution}</p>
              <dl>
                <div><dt>Produces</dt><dd>{manifest.produces.map((item) => item.projectionKind).join(" · ")}</dd></div>
                <div><dt>Requires</dt><dd>{manifest.capabilities.required.join(" · ") || "inga"}</dd></div>
                <div><dt>Fidelity</dt><dd>{manifest.fidelity.mode}{manifest.fidelity.requiresSourceResult ? " · source-bound" : ""}</dd></div>
              </dl>
              <small>{manifest.manifestDigest}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="adapter-section">
        <div className="semantic-section-title"><Workflow /><div><strong>ProjectionEnvelopes</strong><span>Every output points back to the exact source result</span></div></div>
        {adapterRun.projections.length ? (
          <div className="adapter-projection-list">
            {adapterRun.projections.map((projection) => (
              <article key={`${projection.adapterRef.adapterId}:${projection.projectionId}`} className={`adapter-projection is-${projection.status}`}>
                <div className="adapter-projection-head">
                  <div><span>{projection.status}</span><strong>{projection.adapterRef.adapterId}</strong></div>
                  <code>{projection.projectionId}</code>
                </div>
                <div className="projection-binding">
                  <span>immutable source</span><code>{projection.sourceResultRef.resultId}</code><ArrowRight /><span>{projection.output?.projectionKind ?? "no output"}</span>
                </div>
                <div className="projection-reference-counts">
                  <span>{projection.references.eventRefs.length} events</span>
                  <span>{projection.references.anchorRefs.length} anchors</span>
                  <span>{projection.references.sourceMapRefs.length} mappings</span>
                  <span>{projection.references.provenanceRefs.length} activities</span>
                </div>
                <div className="fidelity-report">
                  <strong>Fidelity · {projection.fidelity.mode}</strong>
                  <p>{projection.fidelity.omittedPaths.length
                    ? `The projection omits ${projection.fidelity.omittedPaths.join(" · ")} and therefore requires the source result.`
                    : "No information loss is declared for this projection."}</p>
                </div>
                {projection.output ? (
                  <details>
                    <summary>Show actual adapter output</summary>
                    <pre>{json(projection.output)}</pre>
                  </details>
                ) : null}
                {projection.diagnostics.map((diagnostic) => <p className="adapter-diagnostic" key={diagnostic.diagnosticId ?? diagnostic.message}>{diagnostic.code} · {diagnostic.message}</p>)}
              </article>
            ))}
          </div>
        ) : <div className="lab-empty">The core run produced no adapter projection. Failed runs are skipped after the atomic result boundary.</div>}
      </section>
    </div>
  );
}

type DataField = { name: string; type: string; nullable: boolean };
type DataRow = {
  recordId: string;
  values: Record<string, unknown>;
  _textabana: {
    eventRef: string;
    anchorRef: string;
    sourceMapRef: string | null;
    provenanceRef: string;
    lineageEventRef: string | null;
    inputRecordIds: string[];
    inputAnchorRefs: string[];
  };
};
type DataLineage = {
  lineageId: string;
  operation: string;
  granularity: "record" | "cell";
  mapping: "derived";
  output: { datasetId: string; recordId: string; column?: string };
  inputs: Array<{ type: string; datasetId: string; recordId: string; column?: string }>;
  inputRecordIds?: string[];
  inputAnchorRefs: string[];
};
type DataProjection = {
  schema: string;
  dataset: { datasetId: string; schemaRef: string; role: string; key: string[]; fields: DataField[]; recordCount: number };
  columns: DataField[];
  rows: DataRow[];
  recordLineage: DataLineage[];
  cellLineage: DataLineage[];
  aggregates: Array<{ aggregationId: string; operation: string; mapping: string; inputRecordIds: string[]; value: number }>;
};

type NotebookCellProjection = {
  cellId: string;
  title: string;
  index: number;
  language: string;
  source: string;
  sourceDigest: string;
  metadata: { authored?: Record<string, unknown>; textabana?: Record<string, unknown> };
  mimeBundle: Record<string, unknown>;
  output: {
    outputDigest: string;
    sourceDigest: string;
    outputSourceDigest: string;
    stale: boolean;
    eventRef: string;
    anchorRef: string;
    sourceMapRef: string;
    provenanceRef: string;
  };
};

type NotebookProjection = {
  schema: string;
  notebook: {
    notebookId: string;
    snapshotId: string;
    stateProfile: "fresh" | "session" | "attached";
    executionSupport: string;
    kernelState: string;
    wholeSnapshot: boolean;
    cellOrder: string[];
    metadata: Record<string, unknown>;
  };
  cells: NotebookCellProjection[];
  state: {
    profile: string;
    requestedProfile: string;
    executionSupport: string;
    kernelState: string;
    limitations: string[];
  };
};

type AnnotationCandidateProjection = {
  setId: string;
  annotationId: string;
  title: string;
  body: string;
  bodyDigest: string;
  inputDigest: string;
  origin: "ai";
  status: "candidate";
  revision: 0;
  model: { id: string; version: string; digest: string };
  prompt: { id: string; digest: string };
  confidence: { score: number; method: string };
  candidateDigest: string;
  eventRef: string;
  anchorRef: string;
};

type AnnotationReviewProjection = {
  reviewId: string;
  setId: string;
  annotationId: string;
  candidateEventRef: string;
  revision: 1;
  decision: "accept" | "reject" | "supersede";
  reviewer: string;
  logicalTime: string;
  reviewDigest: string;
  supersededBy?: string;
  eventRef: string;
};

type AnnotationRevisionProjection = {
  revisionId: string;
  annotationId: string;
  revision: number;
  origin: "human" | "human-review";
  state: "accepted" | "rejected" | "superseded";
  body: string;
  bodyDigest: string;
  basedOnEventRef?: string;
  reviewEventRef?: string;
  supersedes?: string;
  supersededBy?: string;
  eventRef: string;
  anchorRef?: string;
};

type AnnotationChainProjection = {
  annotationId: string;
  candidate: AnnotationCandidateProjection;
  review: AnnotationReviewProjection;
  revision: AnnotationRevisionProjection;
  replacement: AnnotationRevisionProjection | null;
};

type AnnotationProjection = {
  schema: string;
  set: {
    setId: string;
    wholeSnapshot: boolean;
    authoredOrder: string[];
    candidateIds: string[];
    currentIds: string[];
    digestAlgorithm: string;
    setDigest: string;
  };
  reviewChain: AnnotationChainProjection[];
  currentAnnotations: Array<{ annotationId: string; state: string; body: string; anchorRef: string; revision: number; supersedes?: string }>;
  exports: { w3cWebAnnotation: Record<string, unknown>; labelStudioTasks: Array<Record<string, unknown>> };
};

function DataLab({ result, onOpenLab }: Pick<PlaygroundOutputProps, "result" | "onOpenLab">) {
  const [tab, setTab] = useState("table");
  const manifest = result.adapterRun?.manifests.find((item) => item.adapterId === "org.textabana.data-table") ?? null;
  const projection = result.adapterRun?.projections.find((item) => item.adapterRef.adapterId === "org.textabana.data-table") ?? null;
  const data = projection?.status === "succeeded" ? projection.output?.data as DataProjection | undefined : undefined;
  const datasetEvents = result.channels["data.datasets"] ?? [];
  const inputEvents = result.channels["data.input.records"] ?? [];
  const outputEvents = result.channels["data.output.records"] ?? [];
  const lineageEvents = result.channels["data.lineage"] ?? [];
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const selectedRow = data?.rows.find((row) => row.recordId === selectedRecordId) ?? data?.rows[0] ?? null;
  const selectedLineage = selectedRow ? data?.recordLineage.find((lineage) => lineage.output.recordId === selectedRow.recordId) ?? null : null;
  const selectedOutputEvent = selectedRow ? outputEvents.find((event) => (event.payload as { recordId?: string })?.recordId === selectedRow.recordId) ?? null : null;
  const selectedSourceMap = selectedOutputEvent ? result.sourceMaps.find((mapping) => mapping.outputRef === selectedOutputEvent.eventId) ?? null : null;
  const selectedCells = selectedRow ? data?.cellLineage.filter((lineage) => lineage.output.recordId === selectedRow.recordId) ?? [] : [];
  const provenance = (result.resultEnvelope?.provenance as { activities?: Array<{ activityId: string; function: string }> } | undefined)?.activities ?? [];
  const activity = selectedOutputEvent ? provenance.find((item) => item.activityId === selectedOutputEvent.provenanceRef) ?? null : null;

  const empty = (
    <div className="data-empty">
      <Database />
      <div><strong>No compatible data projection in this run</strong><p>Select the fixture <b>Data join</b> to produce datasets, records and lineage.</p></div>
      {projection?.diagnostics[0] ? <small>{projection.diagnostics[0].code} · {projection.diagnostics[0].message}</small> : null}
    </div>
  );

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "table", label: "Tabell", count: data?.rows.length, icon: Table2 },
          { id: "schema", label: "Schema", count: datasetEvents.length, icon: Database },
          { id: "lineage", label: "Lineage", count: data?.recordLineage.length, icon: GitBranch },
          { id: "adapter", label: "Adapter", icon: Braces },
        ]}
      />
      {tab === "table" ? (
        <div className="lab-scroll data-lab">
          {!data ? empty : (
            <>
              <div className="projection-notice"><CircleDot /> Adapter projection · not canonical Result · <code>application/json</code></div>
              <div className="data-summary">
                <div><span>Dataset</span><strong>{data.dataset.datasetId}</strong><small>{data.dataset.schemaRef}</small></div>
                <div><span>Records</span><strong>{data.rows.length}</strong><small>stable recordId</small></div>
                <div><span>Columns</span><strong>{data.columns.length}</strong><small>typed JSON values</small></div>
                <div><span>Aggregation</span><strong>{data.aggregates[0]?.value ?? "–"}</strong><small>{data.aggregates[0]?.mapping ?? "saknas"}</small></div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>recordId</th>{data.columns.map((field) => <th key={field.name}>{field.name}<small>{field.type}</small></th>)}</tr></thead>
                  <tbody>{data.rows.map((row) => (
                    <tr key={row.recordId} className={selectedRow?.recordId === row.recordId ? "is-selected" : ""}>
                      <th><button type="button" onClick={() => { setSelectedRecordId(row.recordId); setTab("lineage"); }}>{row.recordId}</button></th>
                      {data.columns.map((field) => <td key={field.name}>{row.values[field.name] === null ? <em>null</em> : String(row.values[field.name])}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="data-table-foot"><span>{projection?.projectionId}</span><Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Show raw events</Button></div>
            </>
          )}
        </div>
      ) : null}
      {tab === "schema" ? (
        <div className="lab-scroll data-lab">
          <div className="canonical-notice"><CheckCircle2 /> Canonical runtime-events · <code>data.datasets</code></div>
          {!datasetEvents.length ? empty : <div className="dataset-grid">{datasetEvents.map((event) => {
            const dataset = event.payload as DataProjection["dataset"];
            return <article key={event.eventId} className={dataset.role === "output" ? "is-output" : ""}>
              <div><span>{dataset.role}</span><strong>{dataset.datasetId}</strong><small>{dataset.recordCount} records</small></div>
              <p>key · {dataset.key.join(" + ")}</p>
              <ul>{dataset.fields.map((field) => <li key={field.name}><code>{field.name}</code><span>{field.type}{field.nullable ? "?" : ""}</span></li>)}</ul>
              <small>{event.target.anchorRef}</small>
            </article>;
          })}</div>}
        </div>
      ) : null}
      {tab === "lineage" ? (
        <div className="lab-scroll data-lab lineage-lab">
          <div className="canonical-notice"><CheckCircle2 /> Canonical events + SourceMap · derived from two input anchors</div>
          {!data || !selectedRow || !selectedLineage ? empty : (
            <>
              <div className="record-picker" aria-label="Select output record">{data.rows.map((row) => <button type="button" key={row.recordId} className={selectedRow.recordId === row.recordId ? "is-active" : ""} onClick={() => setSelectedRecordId(row.recordId)}>{String(row.values[data.dataset.key[0]])}</button>)}</div>
              <div className="lineage-chain">
                <section>
                  <span>Output record</span><strong>{selectedRow.recordId}</strong><code>{selectedSourceMap?.outputSelector?.datasetId} · {selectedSourceMap?.mapping}</code>
                </section>
                <ArrowRight />
                <section className="lineage-inputs">
                  <span>Input records</span>
                  {(selectedLineage.inputRecordIds ?? []).map((recordId) => {
                    const event = inputEvents.find((item) => (item.payload as { recordId?: string })?.recordId === recordId);
                    const anchor = event ? result.anchors.find((item) => item.anchorId === event.target.anchorRef) : null;
                    const quote = anchor?.selectors.find((selector) => selector.type === "TextQuoteSelector");
                    return <article key={recordId}><strong>{recordId}</strong><code>{event?.target.datasetId} · line {event?.line}</code><p>{String(quote?.exact ?? "")}</p></article>;
                  })}
                </section>
              </div>
              <div className="lineage-detail-grid">
                <section><h3>Record SourceMap</h3><pre>{json(selectedSourceMap)}</pre></section>
                <section><h3>Provenance activity</h3><pre>{json(activity)}</pre></section>
              </div>
              <section className="cell-lineage-section"><h3>Cell-lineage</h3><p>Each output column points to one or two semantic input cells through DataSelector.</p><div>{selectedCells.map((lineage) => <article key={lineage.lineageId}><strong>{lineage.output.column}</strong><ArrowRight /><span>{lineage.inputs.map((input) => input.datasetId + "." + input.column).join(" + ")}</span><small>{lineage.mapping}</small></article>)}</div></section>
              <small className="lineage-event-count">{lineageEvents.length} lineage events in committed Result</small>
            </>
          )}
        </div>
      ) : null}
      {tab === "adapter" ? (
        <div className="lab-json-scroll split-json data-adapter-json">
          <section><h3>AdapterManifest</h3><pre>{json(manifest)}</pre></section>
          <section><h3>ProjectionEnvelope</h3><pre>{json(projection)}</pre></section>
        </div>
      ) : null}
    </>
  );
}

function notebookProjection(result: RuntimeResult | null) {
  const projection = result?.adapterRun?.projections.find((item) => item.adapterRef.adapterId === "org.textabana.notebook") ?? null;
  return projection?.status === "succeeded" ? projection.output?.data as NotebookProjection | undefined : undefined;
}

function NotebookLab({ result, previousResult, onOpenLab }: Pick<PlaygroundOutputProps, "result" | "previousResult" | "onOpenLab">) {
  const [tab, setTab] = useState("cells");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("text/plain");
  const manifest = result.adapterRun?.manifests.find((item) => item.adapterId === "org.textabana.notebook") ?? null;
  const projection = result.adapterRun?.projections.find((item) => item.adapterRef.adapterId === "org.textabana.notebook") ?? null;
  const data = notebookProjection(result);
  const previousData = notebookProjection(previousResult);
  const selectedCell = data?.cells.find((cell) => cell.cellId === selectedCellId) ?? data?.cells[0] ?? null;
  const displayedMimeType = selectedCell && Object.hasOwn(selectedCell.mimeBundle, mimeType)
    ? mimeType
    : Object.keys(selectedCell?.mimeBundle ?? {})[0] ?? "text/plain";
  const cellEvents = result.channels["notebook.cells"] ?? [];
  const outputEvents = result.channels["notebook.outputs"] ?? [];
  const selectedEvent = selectedCell ? outputEvents.find((event) => (event.payload as { cellId?: string })?.cellId === selectedCell.cellId) ?? null : null;
  const selectedSourceMap = selectedEvent ? result.sourceMaps.find((mapping) => mapping.outputRef === selectedEvent.eventId) ?? null : null;
  const sameNotebookHistory = Boolean(data && previousData && data.notebook.notebookId === previousData.notebook.notebookId);
  const staleComparisons = data?.cells.map((cell) => {
    const previous = sameNotebookHistory ? previousData?.cells.find((candidate) => candidate.cellId === cell.cellId) ?? null : null;
    return {
      cell,
      previous,
      stale: Boolean(previous && previous.output.sourceDigest !== cell.sourceDigest),
    };
  }) ?? [];

  const empty = (
    <div className="data-empty notebook-empty">
      <NotebookTabs />
      <div><strong>No compatible notebook projection in this run</strong><p>Select the fixture <b>Notebook snapshot</b> to produce cells, MIME bundles and explicit state.</p></div>
      {projection?.diagnostics[0] ? <small>{projection.diagnostics[0].code} · {projection.diagnostics[0].message}</small> : null}
    </div>
  );

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "cells", label: "Cells", count: data?.cells.length, icon: NotebookTabs },
          { id: "mime", label: "MIME", count: selectedCell ? Object.keys(selectedCell.mimeBundle).length : undefined, icon: Layers3 },
          { id: "state", label: "State", icon: CircleDot },
          { id: "stale", label: "Stale", count: staleComparisons.filter((item) => item.stale).length, icon: AlertTriangle },
          { id: "adapter", label: "Adapter", icon: Braces },
        ]}
      />
      {tab === "cells" ? (
        <div className="lab-scroll notebook-lab">
          {!data ? empty : (
            <>
              <div className="canonical-notice"><CheckCircle2 /> Canonical runtime-events · <code>notebook.snapshot</code> + <code>notebook.cells</code></div>
              <div className="notebook-summary">
                <div><span>Notebook</span><strong>{data.notebook.notebookId}</strong><small>{data.notebook.snapshotId}</small></div>
                <div><span>Snapshot</span><strong>{data.notebook.wholeSnapshot ? "whole" : "partial"}</strong><small>{data.cells.length} stable cell ids</small></div>
                <div><span>State</span><strong>{data.notebook.stateProfile}</strong><small>{data.notebook.executionSupport}</small></div>
              </div>
              <div className="notebook-cell-stack">{data.cells.map((cell) => {
                const event = cellEvents.find((candidate) => (candidate.payload as { cellId?: string })?.cellId === cell.cellId);
                return <button type="button" key={cell.cellId} className={selectedCell?.cellId === cell.cellId ? "is-selected" : ""} onClick={() => setSelectedCellId(cell.cellId)}>
                  <span>{String(cell.index + 1).padStart(2, "0")}</span>
                  <div><small>{cell.cellId}</small><strong>{cell.title}</strong><pre>{cell.source}</pre></div>
                  <aside><code>{cell.sourceDigest}</code><small>{event?.target.anchorRef}</small></aside>
                </button>;
              })}</div>
              <div className="data-table-foot"><span>Authored order controls presentation, not hidden kernel state.</span><Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Show raw events</Button></div>
            </>
          )}
        </div>
      ) : null}
      {tab === "mime" ? (
        <div className="lab-scroll notebook-lab mime-lab">
          {!data || !selectedCell ? empty : (
            <>
              <div className="projection-notice"><CircleDot /> Adapter projection · not canonical Result · <code>application/json</code></div>
              <div className="mime-head"><div><span>Cell</span><strong>{selectedCell.cellId}</strong><small>{selectedCell.output.outputDigest}</small></div><div className="mime-picker">{Object.keys(selectedCell.mimeBundle).map((type) => <button type="button" key={type} className={displayedMimeType === type ? "is-active" : ""} onClick={() => setMimeType(type)}>{type}</button>)}</div></div>
              <section className="mime-value"><h3>{displayedMimeType}</h3><pre>{typeof selectedCell.mimeBundle[displayedMimeType] === "string" ? String(selectedCell.mimeBundle[displayedMimeType]) : json(selectedCell.mimeBundle[displayedMimeType])}</pre></section>
              <div className="lineage-detail-grid"><section><h3>CellSelector + SourceMap</h3><pre>{json(selectedSourceMap)}</pre></section><section><h3>Output binding</h3><pre>{json(selectedCell.output)}</pre></section></div>
            </>
          )}
        </div>
      ) : null}
      {tab === "state" ? (
        <div className="lab-scroll notebook-lab state-lab">
          {!data ? empty : (
            <>
              <div className="canonical-notice"><CheckCircle2 /> Canonical runtime-event · <code>notebook.state</code> · the core run profile remains fresh</div>
              <div className="state-profile-grid">
                {[
                  { id: "fresh", support: "playground-subset", detail: "Structural snapshot and projection without a kernel." },
                  { id: "session", support: "contract-only execution", detail: "The profile is explicit; no external session runs here." },
                  { id: "attached", support: "contract-only execution", detail: "An external kernel cannot be assumed or simulated." },
                ].map((profile) => <article key={profile.id} className={data.state.requestedProfile === profile.id ? "is-current" : ""}><span>{data.state.requestedProfile === profile.id ? "requested" : "available token"}</span><strong>{profile.id}</strong><code>{profile.support}</code><p>{profile.detail}</p></article>)}
              </div>
              <section className="state-envelope"><h3>Committed state descriptor</h3><pre>{json(data.state)}</pre></section>
            </>
          )}
        </div>
      ) : null}
      {tab === "stale" ? (
        <div className="lab-scroll notebook-lab stale-lab">
          {!data ? empty : (
            <>
              <div className="projection-notice"><CircleDot /> View-only revision comparison · previous output never becomes current output</div>
              {!sameNotebookHistory ? <div className="notebook-history-empty"><AlertTriangle /><div><strong>No comparable previous snapshot</strong><p>Change a cell&apos;s text without changing its cell id. The next run can then classify the older output.</p></div></div> : (
                <div className="stale-list">{staleComparisons.map(({ cell, previous, stale }) => <article key={cell.cellId} className={stale ? "is-stale" : "is-fresh"}>
                  <div><span>{cell.cellId}</span><strong>{stale ? "previous output · stale" : previous ? "previous output · still valid" : "new cell · no previous output"}</strong></div>
                  <dl><div><dt>previous source</dt><dd>{previous?.output.sourceDigest ?? "–"}</dd></div><div><dt>current source</dt><dd>{cell.sourceDigest}</dd></div><div><dt>rule</dt><dd>previous.output.sourceDigest {stale ? "≠" : "="} current.cell.sourceDigest</dd></div></dl>
                </article>)}</div>
              )}
            </>
          )}
        </div>
      ) : null}
      {tab === "adapter" ? (
        <div className="lab-json-scroll split-json data-adapter-json">
          <section><h3>AdapterManifest</h3><pre>{json(manifest)}</pre></section>
          <section><h3>ProjectionEnvelope</h3><pre>{json(projection)}</pre></section>
        </div>
      ) : null}
    </>
  );
}

function annotationProjection(result: RuntimeResult | null) {
  const projection = result?.adapterRun?.projections.find((item) => item.adapterRef.adapterId === "org.textabana.annotation-review") ?? null;
  return projection?.status === "succeeded" ? projection.output?.data as AnnotationProjection | undefined : undefined;
}

function AnnotationLab({ result, onOpenLab }: Pick<PlaygroundOutputProps, "result" | "onOpenLab">) {
  const [tab, setTab] = useState("queue");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const manifest = result.adapterRun?.manifests.find((item) => item.adapterId === "org.textabana.annotation-review") ?? null;
  const projection = result.adapterRun?.projections.find((item) => item.adapterRef.adapterId === "org.textabana.annotation-review") ?? null;
  const data = annotationProjection(result);
  const selected = data?.reviewChain.find((item) => item.annotationId === selectedAnnotationId) ?? data?.reviewChain[0] ?? null;
  const candidateEvent = selected ? (result.channels["annotation.candidates"] ?? []).find((event) => (event.payload as { annotationId?: string }).annotationId === selected.annotationId) ?? null : null;
  const anchor = candidateEvent ? result.anchors.find((item) => item.anchorId === candidateEvent.target.anchorRef) ?? null : null;
  const sourceMap = candidateEvent ? result.sourceMaps.find((item) => item.outputRef === candidateEvent.eventId) ?? null : null;
  const reviewEvent = selected ? (result.channels["annotation.reviews"] ?? []).find((event) => (event.payload as { annotationId?: string }).annotationId === selected.annotationId) ?? null : null;
  const reviewMap = reviewEvent ? result.sourceMaps.find((item) => item.outputRef === reviewEvent.eventId) ?? null : null;

  const empty = (
    <div className="data-empty annotation-empty">
      <Bot />
      <div><strong>No compatible annotation projection in this run</strong><p>Select the fixture <b>Annotation & AI review</b> to produce candidates, review revisions and standards exports.</p></div>
      {projection?.diagnostics[0] ? <small>{projection.diagnostics[0].code} · {projection.diagnostics[0].message}</small> : null}
    </div>
  );

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "queue", label: "Review queue", count: data?.reviewChain.length, icon: Bot },
          { id: "chain", label: "Revision chain", icon: Workflow },
          { id: "targets", label: "Targets", icon: MapPin },
          { id: "w3c", label: "W3C", icon: FileJson },
          { id: "label-studio", label: "Label Studio", icon: Layers3 },
          { id: "adapter", label: "Adapter", icon: Braces },
        ]}
      />
      {tab === "queue" ? (
        <div className="lab-scroll annotation-lab">
          {!data ? empty : (
            <>
              <div className="canonical-notice"><CheckCircle2 /> Canonical append-only events · <code>annotation.candidates</code> + <code>annotation.reviews</code> + <code>annotation.revisions</code></div>
              <div className="annotation-summary">
                <div><span>Set</span><strong>{data.set.setId}</strong><small>{data.set.wholeSnapshot ? "whole snapshot" : "partial"}</small></div>
                <div><span>Candidates</span><strong>{data.reviewChain.length}</strong><small>immutable revision 0</small></div>
                <div><span>Current</span><strong>{data.set.currentIds.length}</strong><small>{data.set.currentIds.join(" · ")}</small></div>
                <div><span>Digest</span><strong>{data.set.digestAlgorithm}</strong><small>{data.set.setDigest}</small></div>
              </div>
              <div className="annotation-queue">{data.reviewChain.map((chain) => (
                <button type="button" key={chain.annotationId} className={selected?.annotationId === chain.annotationId ? "is-selected" : ""} onClick={() => { setSelectedAnnotationId(chain.annotationId); setTab("chain"); }}>
                  <div className="annotation-card-head"><span className={`review-decision is-${chain.review.decision}`}>{chain.review.decision}</span><code>{chain.annotationId}</code></div>
                  <strong>{chain.candidate.title}</strong>
                  <p>{chain.candidate.body}</p>
                  <dl>
                    <div><dt>confidence</dt><dd>{Math.round(chain.candidate.confidence.score * 100)}% · {chain.candidate.confidence.method}</dd></div>
                    <div><dt>model</dt><dd>{chain.candidate.model.id}@{chain.candidate.model.version}</dd></div>
                    <div><dt>prompt</dt><dd>{chain.candidate.prompt.id}</dd></div>
                  </dl>
                  <small>{chain.candidate.candidateDigest}</small>
                </button>
              ))}</div>
              <div className="data-table-foot"><span>The decision is in the source; change <code>decision</code> and run to create a new snapshot chain.</span><Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Show raw events</Button></div>
            </>
          )}
        </div>
      ) : null}
      {tab === "chain" ? (
        <div className="lab-scroll annotation-lab annotation-chain-view">
          {!data || !selected ? empty : (
            <>
              <div className="canonical-notice"><CheckCircle2 /> Review creates revision 1 · the candidate&apos;s revision 0 is never rewritten</div>
              <div className="record-picker" aria-label="Select annotation">{data.reviewChain.map((chain) => <button type="button" key={chain.annotationId} className={selected.annotationId === chain.annotationId ? "is-active" : ""} onClick={() => setSelectedAnnotationId(chain.annotationId)}>{chain.annotationId}</button>)}</div>
              <div className="annotation-chain">
                <section><span>Model candidate · r0</span><strong>{selected.candidate.status}</strong><code>{selected.candidate.eventRef}</code><p>{selected.candidate.body}</p></section>
                <ArrowRight />
                <section><span>Human review · r1</span><strong>{selected.review.decision}</strong><code>{selected.review.eventRef}</code><p>{selected.review.reviewer} · {selected.review.reviewDigest}</p></section>
                <ArrowRight />
                <section><span>Materialized revision</span><strong>{selected.revision.state}</strong><code>{selected.revision.eventRef}</code><p>{selected.revision.revisionId}</p></section>
                {selected.replacement ? <><ArrowRight /><section className="is-replacement"><span>Human replacement · r0</span><strong>{selected.replacement.annotationId}</strong><code>{selected.replacement.eventRef}</code><p>{selected.replacement.body}</p></section></> : null}
              </div>
              <div className="lineage-detail-grid"><section><h3>Candidate facts</h3><pre>{json(selected.candidate)}</pre></section><section><h3>Review + revision</h3><pre>{json({ review: selected.review, revision: selected.revision, replacement: selected.replacement })}</pre></section></div>
            </>
          )}
        </div>
      ) : null}
      {tab === "targets" ? (
        <div className="lab-scroll annotation-lab annotation-targets">
          {!data || !selected ? empty : (
            <>
              <div className="canonical-notice"><CheckCircle2 /> The same stable Anchor carries the source target through candidate, review and export</div>
              <div className="record-picker" aria-label="Select annotation">{data.reviewChain.map((chain) => <button type="button" key={chain.annotationId} className={selected.annotationId === chain.annotationId ? "is-active" : ""} onClick={() => setSelectedAnnotationId(chain.annotationId)}>{chain.annotationId}</button>)}</div>
              <div className="lineage-detail-grid"><section><h3>Anchor + selectors</h3><pre>{json(anchor)}</pre></section><section><h3>Candidate SourceMap</h3><pre>{json(sourceMap)}</pre></section></div>
              <section className="annotation-review-map"><h3>Review SourceMap</h3><p>Derived mapping uses the candidate anchor{selected.replacement ? " and the replacement anchor" : ""} as explicit inputs.</p><pre>{json(reviewMap)}</pre></section>
              <Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Open Channel & Result</Button>
            </>
          )}
        </div>
      ) : null}
      {tab === "w3c" ? (
        <div className="lab-json-scroll annotation-export">
          <div className="projection-notice"><CircleDot /> Adapter projection · W3C Web Annotation <code>AnnotationPage</code> · targets are copied from Textabana Anchor</div>
          {!data ? empty : <pre>{json(data.exports.w3cWebAnnotation)}</pre>}
        </div>
      ) : null}
      {tab === "label-studio" ? (
        <div className="lab-json-scroll annotation-export">
          <div className="projection-notice"><CircleDot /> Adapter projection · tested Label Studio task/import subset · no API or project round trip</div>
          {!data ? empty : <pre>{json(data.exports.labelStudioTasks)}</pre>}
        </div>
      ) : null}
      {tab === "adapter" ? (
        <div className="lab-json-scroll split-json data-adapter-json">
          <section><h3>AdapterManifest</h3><pre>{json(manifest)}</pre></section>
          <section><h3>ProjectionEnvelope</h3><pre>{json(projection)}</pre></section>
        </div>
      ) : null}
    </>
  );
}

type StructuralDiffEntry = {
  path: string;
  operation: "add" | "remove" | "replace";
  before?: unknown;
  after?: unknown;
};

function pointerPart(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function structuralDiff(before: unknown, after: unknown, path = "", changes: StructuralDiffEntry[] = []): StructuralDiffEntry[] {
  if (changes.length >= 120 || Object.is(before, after)) return changes;
  const beforeObject = before !== null && typeof before === "object";
  const afterObject = after !== null && typeof after === "object";
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    changes.push({ path: path || "/", operation: "replace", before, after });
    return changes;
  }
  const left = before as Record<string, unknown>;
  const right = after as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    const childPath = `${path}/${pointerPart(key)}`;
    if (!Object.hasOwn(left, key)) changes.push({ path: childPath, operation: "add", after: right[key] });
    else if (!Object.hasOwn(right, key)) changes.push({ path: childPath, operation: "remove", before: left[key] });
    else structuralDiff(left[key], right[key], childPath, changes);
    if (changes.length >= 120) break;
  }
  return changes;
}

function diffValue(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (serialized === undefined) return "∅";
  return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
}

function ConformanceStatusMark({ status }: { status: "passed" | "failed" | "not-run" }) {
  return (
    <span className={`conformance-status is-${status}`}>
      {status === "passed" ? <CheckCircle2 aria-hidden="true" /> : status === "failed" ? <AlertTriangle aria-hidden="true" /> : <CircleDot aria-hidden="true" />}
      {status === "passed" ? "passed" : status === "failed" ? "blocked" : "not run"}
    </span>
  );
}

function SemanticIdentityPanel({ bundle }: { bundle: RuntimeResult["semanticIdentity"] }) {
  const [verification, setVerification] = useState<{ bundle: typeof bundle; status: "checking" | "passed" | "failed"; message: string; details?: unknown } | null>(null);
  const current = verification?.bundle === bundle ? verification : null;
  const verify = async () => {
    const snapshot = bundle;
    setVerification({ bundle: snapshot, status: "checking", message: "Checking the bundle…" });
    try {
      const { verifySemanticBundle } = await import("../runtime/semantic-identity.js");
      const details = await verifySemanticBundle(snapshot);
      setVerification({ bundle: snapshot, status: "passed", message: "Structure, references and checksums verified.", details });
    } catch (error) {
      setVerification({ bundle: snapshot, status: "failed", message: error instanceof Error ? error.message : "The bundle could not be verified." });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json(bundle)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "textabana-identity.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="lab-scroll conformance-lab">
    <div className="subset-notice">SHA-256 for versioned semantic artifacts. Verification covers the bundle&apos;s structure, content and internal relationships; full runtime conformance requires additional profile tests.</div>
    <p><a href="/contracts/semantic-bundle-v1.schema.json" download>Download JSON Schema</a> · <a href="/conformance/contract-report.json" download>Download contract test results</a></p>
    <p>The text reference profile compares 70 fixed cases between the JavaScript kernel and a standalone Python runtime. It covers text, nested blocks and pure text functions. <a href="/conformance/text-core-report.json" download>Download the cross-runtime comparison</a>. This separate report does not verify the current document or its artifact identities.</p>
    <p>The interval profile compares 80 additional cases: open intervals, ordering, named closes and block inheritance. It also compares the exact order of committed function calls. <a href="/conformance/scoped-text-report.json" download>Download the interval comparison</a>.</p>
    <p>The channel profile compares 80 additional cases for render, exact payloads, global event order and stored channel results. Transient events and atomic rollback on failure are included. <a href="/conformance/channel-core-report.json" download>Download the channel comparison</a>. Source positions and full provenance equivalence are outside this comparison.</p>
    <p>The position profile compares 70 cases for source lines, Unicode positions, quote context and event-to-anchor links. Reused row anchors, emoji and colliding row keys are included. <a href="/conformance/source-map-core-report.json" download>Download the position comparison</a>. The report covers the specified code version and does not verify the current document.</p>
    <p>The module gate verifies 54 cases for package integrity, grants and function contracts, including whether startup code ran before a failure. <a href="/conformance/module-gate-report.json" download>Download the module report</a>. The gate runs the same JavaScript kernel; it does not verify the current document or provide a sandbox guarantee.</p>
    <p>Independent package admission compares 72 admission decisions between JavaScript and standalone Python. Manifests, locking, digests and grants are checked without Python executing module code. <a href="/conformance/module-admission-report.json" download>Download the package comparison</a>. Successful admission does not imply that subsequent export validation or execution succeeds. The report covers the frozen cases, not the current document.</p>
    {!bundle ? <div className="lab-empty">Enable SHA-256 identities and run the document.</div> : <>
      <div className="lab-table-wrap"><table className="lab-table"><thead><tr><th>Artifact</th><th>Identity</th></tr></thead><tbody>
        {(["source", "context", "ir", "plan", "result"] as const).map((key) => <tr key={key}><td>{key}</td><td><code>{bundle[key]?.id ?? "No artifact in this run"}</code></td></tr>)}
      </tbody></table></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={verify} disabled={current?.status === "checking"}><ShieldCheck aria-hidden="true" />{current?.status === "checking" ? "Verifying…" : "Verify bundle"}</Button>
        <Button variant="outline" onClick={download}><FileJson aria-hidden="true" />Download bundle</Button>
      </div>
      {current ? <div role="status" aria-live="polite"><p>{current.status === "passed" ? "✓ " : current.status === "failed" ? "Invalid bundle: " : ""}{current.message}</p>
        {current.details ? <details><summary>Verification results · JSON</summary><pre>{json(current.details)}</pre></details> : null}
      </div> : null}
      <details><summary>Verification bundle · JSON</summary><pre>{json(bundle)}</pre></details>
    </>}
  </div>;
}

function ConformanceLab({ result, previousResult, onSelectFixture }: Pick<PlaygroundOutputProps, "result" | "previousResult" | "onSelectFixture">) {
  const [tab, setTab] = useState("gate");
  const report = result.conformanceReport;
  const profiles = report?.profiles ?? [];
  const [selectedProfileId, setSelectedProfileId] = useState("language-core/0.4");
  const selectedProfile = profiles.find((profile) => profile.profile === selectedProfileId) ?? profiles[0] ?? null;
  const changes = useMemo(
    () => report && previousResult?.conformanceReport
      ? structuralDiff(previousResult.conformanceReport.structuralSnapshot, report.structuralSnapshot)
      : [],
    [previousResult, report],
  );
  const capabilities = result.capabilities as { implemented?: string[]; unsupported?: string[]; limits?: Record<string, string> } | null;

  if (!report) return <div className="lab-empty">Run a fixture to create a machine-readable conformance report.</div>;

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "gate", label: "Gate", icon: ShieldCheck },
          { id: "profiles", label: "Profiler", count: profiles.length, icon: Layers3 },
          { id: "diff", label: "Strukturell diff", count: changes.length, icon: GitBranch },
          { id: "negative", label: "Negativa cases", count: report.negativeFixtures.length + 1, icon: AlertTriangle },
          { id: "report", label: "Report JSON", icon: FileJson },
          { id: "identity", label: "Identiteter", icon: Fingerprint },
        ]}
      />
      {tab === "identity" ? <SemanticIdentityPanel bundle={result.semanticIdentity} /> : null}
      {tab === "gate" ? (
        <div className="lab-scroll conformance-lab">
          <div className="subset-notice"><ShieldCheck /> Run-bound evidence · <code>{report.schema}</code> · no full profile conformance</div>
          <section className={`conformance-gate is-${report.gate.status}`}>
            <div>
              <span>Conformance gate</span>
              <strong>{report.gate.status === "passed" ? "This case can make bounded subset claims" : "Profile claims are blocked"}</strong>
              <p><code>{report.case.caseId}</code> produced <b>{report.case.actualOutcome}</b>; expected <b>{report.case.expectedOutcome}</b>.</p>
            </div>
            <ConformanceStatusMark status={report.gate.status === "passed" ? "passed" : "failed"} />
          </section>
          <div className="lab-metrics">
            <article><span>Passed profiles</span><strong>{report.summary.passed}</strong><small>active requirements only</small></article>
            <article><span>Blocked profiles</span><strong>{report.summary.failed}</strong><small>{report.gate.blockingRequirementIds.join(" · ") || "inga blockers"}</small></article>
            <article><span>Not run</span><strong>{report.summary.notRun}</strong><small>no relevant inputs</small></article>
            <article><span>Claimable subset</span><strong>{report.summary.claimableProfiles.length}</strong><small>contract-only never counts</small></article>
          </div>
          <section className="conformance-stage-list" aria-label="Conformance pipeline">
            {report.stages.map((stage, index) => (
              <article key={stage.stage} className={`is-${stage.status}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{stage.stage}</strong><p>{stage.message}</p>{stage.evidenceRefs.length ? <code>{stage.evidenceRefs.join(" · ")}</code> : null}</div>
                <ConformanceStatusMark status={stage.status} />
              </article>
            ))}
          </section>
          <section className="conformance-golden-card">
            <div><span>Normalized golden</span><strong>{report.golden?.status === "passed" ? "0 structural differences from the baseline" : report.golden?.status === "failed" ? "A golden regression blocks the case" : "No golden baseline for this fixture"}</strong></div>
            <dl>
              <div><dt>Suite</dt><dd>{report.suite.suiteId}@{report.suite.version}</dd></div>
              <div><dt>Baseline</dt><dd>{report.golden?.expectedStructuralDigest ?? "not applicable"}</dd></div>
              <div><dt>Actual</dt><dd>{report.structuralDigest}</dd></div>
            </dl>
          </section>
          <section className="conformance-capabilities">
            <div className="semantic-section-title"><Braces /><div><strong>Capability response</strong><span>Declaration is shown separately from the verified outcome</span></div></div>
            <div><article><span>Implemented subset</span><p>{capabilities?.implemented?.join(" · ") || "–"}</p></article><article><span>Explicit unsupported</span><p>{capabilities?.unsupported?.join(" · ") || "–"}</p></article></div>
          </section>
        </div>
      ) : null}
      {tab === "profiles" ? (
        <div className="lab-scroll conformance-profile-view">
          <div className="conformance-profile-bar" role="list" aria-label="Select conformance profile">
            {profiles.map((profile) => (
              <button type="button" className={profile.profile === selectedProfile?.profile ? "is-active" : ""} onClick={() => setSelectedProfileId(profile.profile)} key={profile.profile}>
                <code>{profile.profile}</code>
                <span>{profile.declaredSupport}</span>
                <ConformanceStatusMark status={profile.status} />
              </button>
            ))}
          </div>
          {selectedProfile ? <ConformanceProfileDetail profile={selectedProfile} /> : null}
        </div>
      ) : null}
      {tab === "diff" ? (
        <div className="lab-scroll conformance-diff-view">
          <div className="subset-notice"><GitBranch /> RFC 6901 paths · {report.normalization?.ignoredPaths.length ?? 0} explicitly ignored transport fields · at most 120 changes shown</div>
          {!previousResult?.conformanceReport ? <div className="lab-empty">Change the text or run again to compare with the previous run.</div> : changes.length === 0 ? (
            <div className="conformance-zero-diff"><CheckCircle2 /><strong>0 structural differences</strong><p>Transport ids and measured duration are excluded; the report shows the published normalization policy.</p></div>
          ) : (
            <div className="conformance-diff-list">{changes.map((change, index) => (
              <article key={`${change.path}:${index}`}>
                <div><span>{change.operation}</span><code>{change.path}</code></div>
                <dl><div><dt>before</dt><dd>{diffValue(change.before)}</dd></div><div><dt>after</dt><dd>{diffValue(change.after)}</dd></div></dl>
              </article>
            ))}</div>
          )}
        </div>
      ) : null}
      {tab === "negative" ? (
        <div className="lab-scroll negative-case-view">
          <div className="lab-intro"><div><span>Isolated regression cases</span><strong>Failures must be exact and atomic</strong></div><p>A passing negative case does not change the core result to succeeded. It proves that the correct failure boundary was triggered.</p></div>
          <div className="negative-case-list">
            {report.negativeFixtures.map((fixture) => (
              <article className={report.case.fixtureId === fixture.fixtureId ? `is-active is-${report.gate.status}` : ""} key={fixture.fixtureId}>
                <AlertTriangle /><div><strong>{fixture.caseId}</strong><p>{fixture.purpose}</p><code>{fixture.expectedOutcome} · {fixture.expectedDiagnosticCode}</code></div>
                <Button size="sm" variant="outline" onClick={() => onSelectFixture(fixture.fixtureId)}>Run fixture</Button>
              </article>
            ))}
            <article className={report.case.fixtureId === "cancellation-probe" ? `is-active is-${report.cancellation.status}` : ""}>
              <CircleDot /><div><strong>cooperative-cancellation</strong><p>{report.cancellation.limitation}</p><code>cancelled · {report.cancellation.diagnosticCode}</code></div>
              <Button size="sm" variant="outline" onClick={() => onSelectFixture("cancellation-probe")}>Run cancellation</Button>
            </article>
          </div>
        </div>
      ) : null}
      {tab === "report" ? (
        <div className="lab-json-scroll conformance-report-json">
          <div className="projection-notice"><CircleDot /> Machine-readable playground subset evidence · source-bound · canonical=false</div>
          <pre>{json(report)}</pre>
        </div>
      ) : null}
    </>
  );
}

function ConformanceProfileDetail({ profile }: { profile: ConformanceProfile }) {
  return (
    <section className={`conformance-profile-detail is-${profile.status}`}>
      <header>
        <div><span>Selected profile</span><strong>{profile.profile}</strong><p>Declared: <code>{profile.declaredSupport}</code> · Derived: <code>{profile.derivedSupport ?? "not evaluated"}</code></p></div>
        <div className="profile-claim-state"><ConformanceStatusMark status={profile.status} /><small>{profile.claimable ? "claimable playground-subset" : profile.derivedSupport === "contract-only" ? "contract-only · never claimable" : "no active claim"}</small></div>
      </header>
      <div className="conformance-requirement-list">
        {profile.requirements.map((requirement) => (
          <article key={requirement.requirementId}>
            <ConformanceStatusMark status={requirement.status} />
            <div><strong>{requirement.requirementId}</strong><p>{requirement.message}</p>{requirement.evidenceRefs.length ? <code>{requirement.evidenceRefs.join(" · ")}</code> : null}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChannelLab({ result, onOpenLab }: Pick<PlaygroundOutputProps, "result" | "onOpenLab">) {
  const [tab, setTab] = useState("timeline");
  const events = useMemo(
    () => Object.values(result.channels).flat().sort((left, right) => left.sequence - right.sequence),
    [result.channels],
  );
  const channelNames = useMemo(() => Object.keys(result.channels), [result.channels]);
  const activeTab = ["timeline", "result", "adapters", "render", ...channelNames].includes(tab) ? tab : "timeline";
  const selectedChannel = channelNames.includes(activeTab) ? activeTab : null;

  return (
    <>
      <LabTabs
        value={activeTab}
        onChange={setTab}
        items={[
          { id: "timeline", label: "Global timeline", count: events.length, icon: Workflow },
          { id: "result", label: "Result JSON", icon: FileJson },
          { id: "adapters", label: "Adapters", count: result.adapterRun?.projections.length ?? 0, icon: Braces },
          { id: "render", label: "Render", icon: Sparkles },
          ...channelNames.map((name) => ({ id: name, label: name, count: result.channels[name].length, icon: name === "system.out" ? Rows3 : RadioTower })),
        ]}
      />
      {activeTab === "render" ? <RenderView output={result.output} /> : null}
      {activeTab === "adapters" ? <AdapterRunView result={result} /> : null}
      {activeTab === "result" ? (
        <div className="lab-json-scroll">
          <div className="subset-notice"><CircleDot /> Atomic playground envelope · failed runs publish empty render and empty domain channels</div>
          <pre>{json(result.resultEnvelope)}</pre>
        </div>
      ) : null}
      {selectedChannel ? (
        <div className="channel-scroll">
          <div className="descriptor-card">
            <div><span>ChannelDescriptor</span><strong>{selectedChannel}</strong></div>
            <dl>
              <div><dt>Schema</dt><dd>{result.channelDescriptors[selectedChannel]?.schemaRef ?? "inferred"}</dd></div>
              <div><dt>Delivery</dt><dd>{result.channelDescriptors[selectedChannel]?.delivery ?? "snapshot"}</dd></div>
              <div><dt>Persistence</dt><dd>{result.channelDescriptors[selectedChannel]?.persistence ?? "durable"}</dd></div>
              <div><dt>Ordering</dt><dd>{result.channelDescriptors[selectedChannel]?.ordering ?? "global-sequence"}</dd></div>
            </dl>
          </div>
          <div className="channel-events">{result.channels[selectedChannel].map((event) => <EventCard event={event} key={event.id} />)}</div>
        </div>
      ) : null}
      {activeTab === "timeline" ? (
        <div className="lab-scroll channel-timeline">
          <div className="lab-metrics">
            <article><span>Run</span><strong>{result.runId ?? "–"}</strong><small>committed</small></article>
            <article><span>Channels</span><strong>{channelNames.length}</strong><small>open namespace</small></article>
            <article><span>Events</span><strong>{events.length}</strong><small>append-only</small></article>
            <article><span>Diagnostics</span><strong>{result.diagnostics.length}</strong><small>control plane</small></article>
          </div>
          <div className="descriptor-list">
            {Object.values(result.channelDescriptors).filter((descriptor) => channelNames.includes(descriptor.name)).map((descriptor) => (
              <article key={descriptor.name}>
                <RadioTower />
                <div><strong>{descriptor.name}</strong><span>{descriptor.schemaRef}</span></div>
                <small>{descriptor.declared ? "declared" : "inferred"}</small>
              </article>
            ))}
          </div>
          <div className="timeline-list">
            {events.map((event) => (
              <button type="button" key={event.id} onClick={() => setTab(event.channel)}>
                <span>{event.sequence}</span>
                <code>{event.channel}</code>
                <strong>{event.kind}</strong>
                <small>{event.target.mode} {event.target.mode === "row" ? event.row : event.line}</small>
                <em>{typeof event.payload === "object" ? json(event.payload).replace(/\s+/g, " ").slice(0, 90) : String(event.payload).slice(0, 90)}</em>
                <ArrowRight />
              </button>
            ))}
          </div>
          {events.some((event) => event.channel === "system.out") ? (
            <Button size="sm" variant="outline" className="cross-lab-action" onClick={() => onOpenLab("editor")}><PanelRight /> Show metadata in the editor</Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function PlaygroundOutput(props: PlaygroundOutputProps) {
  return (
    <ResultShell lab={props.lab} result={props.result} running={props.running}>
      {props.lab === "language" ? <LanguageLab result={props.result} /> : null}
      {props.lab === "kernel" ? <EditorKernelLab result={props.result} onOpenLab={props.onOpenLab} onSelectFixture={props.onSelectFixture} /> : null}
      {props.lab === "editor" ? <EditorLab result={props.result} previousResult={props.previousResult} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "channels" ? <ChannelLab result={props.result} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "data" ? <DataLab result={props.result} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "notebook" ? <NotebookLab result={props.result} previousResult={props.previousResult} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "annotation" ? <AnnotationLab result={props.result} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "conformance" ? <ConformanceLab result={props.result} previousResult={props.previousResult} onSelectFixture={props.onSelectFixture} /> : null}
    </ResultShell>
  );
}
