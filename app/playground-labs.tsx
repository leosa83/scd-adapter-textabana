"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowRight,
  Braces,
  CheckCircle2,
  CircleDot,
  Code2,
  FileJson,
  GitBranch,
  Layers3,
  MapPin,
  PanelRight,
  RadioTower,
  Rows3,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  ChannelEvent,
  ExecutionStep,
  LabId,
  RuntimeAnchor,
  RuntimeResult,
} from "./playground-model";

type PlaygroundOutputProps = {
  lab: LabId;
  result: RuntimeResult;
  previousResult: RuntimeResult | null;
  running: boolean;
  onOpenLab: (lab: LabId) => void;
};

const labCopy: Record<LabId, { title: string; icon: typeof Braces }> = {
  language: { title: "Language & Scope", icon: Braces },
  editor: { title: "Editor Metadata", icon: PanelRight },
  channels: { title: "Channel & Result", icon: RadioTower },
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
    <section className="preview-shell lab-result-shell" aria-label={`${labCopy[lab].title} resultat`}>
      <div className="panel-bar">
        <div className="panel-title"><Icon aria-hidden="true" />{labCopy[lab].title}</div>
        <span className={`runtime-state ${result.ok ? "is-ok" : "is-error"}`} aria-live="polite">
          <span />
          {running ? "Kompilerar" : result.ok ? `Run ${result.runId ?? "–"} · committed` : "Run failed"}
        </span>
      </div>
      {!result.ok ? (
        <div className="error-state lab-error-banner" role="alert">
          <div className="error-icon"><AlertTriangle aria-hidden="true" /></div>
          <div>
            <p className="error-kicker">Körningen publicerade inget domänresultat</p>
            <h3>{result.error}</h3>
            <p>{result.diagnostics[0]?.code ?? "TBA-RUN-LAB"} · committed render och channels är tomma.</p>
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
    <div className="output-tabs lab-tabs" role="tablist" aria-label="Inspektionsvy">
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
  if (!steps.length) return <div className="lab-empty">Inga funktionssteg kördes för denna källa.</div>;
  return (
    <ol className={compact ? "stage-flow is-compact" : "stage-flow"}>
      {steps.map((step) => (
        <li key={`${step.step}:${step.stageId}`}>
          <span className="stage-sequence">{step.step}</span>
          <div className="stage-card">
            <div className="stage-card-head">
              <strong>{step.function}</strong>
              <span className={`stage-modality is-${step.modality}`}>{step.modality}</span>
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
  const steps = result.plan?.steps ?? [];

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "semantics", label: "Semantik", count: scopes.length + blocks.length, icon: Layers3 },
          { id: "plan", label: "Körplan", count: steps.length, icon: Workflow },
          { id: "ir", label: "IR-projektion", icon: FileJson },
          { id: "render", label: "Render", icon: Sparkles },
        ]}
      />
      {tab === "render" ? <RenderView output={result.output} /> : null}
      {tab === "ir" ? (
        <div className="lab-json-scroll">
          <div className="subset-notice"><CircleDot /> Verklig runtimeprojektion · <code>textabana.ir/lab-v1</code> · inte full profilkonformitet</div>
          <pre>{json(ir)}</pre>
        </div>
      ) : null}
      {tab === "plan" ? (
        <div className="lab-scroll">
          <div className="lab-intro">
            <div><span>Faktisk exekveringsordning</span><strong>{steps.length} stage-invocations</strong></div>
            <p>Ordningen instrumenteras i samma worker som producerar render och channels.</p>
          </div>
          <StageFlow steps={steps} />
          {(result.plan?.unsupported.length ?? 0) > 0 ? (
            <div className="unsupported-strip"><AlertTriangle /> Definierat men ännu unsupported: {result.plan?.unsupported.join(" · ")}</div>
          ) : null}
        </div>
      ) : null}
      {tab === "semantics" ? (
        <div className="lab-scroll language-overview">
          <div className="lab-metrics">
            <article><span>Intervall</span><strong>{scopes.length}</strong><small>sortering {ir?.configuration.scopeOrder ?? "–"}</small></article>
            <article><span>Block</span><strong>{blocks.length}</strong><small>strict nesting</small></article>
            <article><span>Körda steg</span><strong>{steps.length}</strong><small>actual trace</small></article>
            <article><span>Syntaxnoder</span><strong>{ir?.nodes.length ?? 0}</strong><small>source projection</small></article>
          </div>

          <section className="semantic-section">
            <div className="semantic-section-title"><GitBranch /><div><strong>Öppna intervall</strong><span>Identifieritet, ordning och segment</span></div></div>
            <div className="scope-cards">
              {scopes.map((scope) => (
                <article key={scope.scopeId}>
                  <div><strong>{scope.name}</strong><code>@id={scope.id}</code></div>
                  <span className="scope-order">order {scope.order}</span>
                  <p>Öppnar line {scope.openLine} · stänger {scope.closeLine ? `line ${scope.closeLine}` : "inte"}</p>
                  <small>{scope.segments.map((segment) => `L${segment.startLine}–${segment.endLine}`).join(" · ") || "Inget textsegment"}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="semantic-section">
            <div className="semantic-section-title"><Code2 /><div><strong>Block och inheritance</strong><span>Blockpipelinen kör före ambient inheritance</span></div></div>
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
            <div className="semantic-section-title"><Workflow /><div><strong>Vad kördes?</strong><span>Samma trace visas i detalj under Körplan</span></div></div>
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

function EditorLab({
  result,
  previousResult,
  onOpenLab,
}: Pick<PlaygroundOutputProps, "result" | "previousResult" | "onOpenLab">) {
  const [tab, setTab] = useState("editor");
  const events = result.channels["system.out"] ?? [];
  const previousEvents = previousResult?.channels["system.out"] ?? [];
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

  useEffect(() => {
    if (selectedId && !events.some((event) => event.id === selectedId)) setSelectedId(null);
  }, [events, selectedId]);

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
          <div className="lab-intro"><div><span>Reserverad kanal</span><strong>system.out</strong></div><p><code>kind</code> är semantik; <code>target.mode</code> är row eller line.</p></div>
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
            <span><CheckCircle2 /> {events.length} aktuella</span>
            <span><GitBranch /> {moved} flyttade</span>
            <span className={orphaned ? "has-warning" : ""}><AlertTriangle /> {orphaned} orphaned</span>
            <small>Jämförs med föregående run på denna enhet</small>
          </div>
          <div className="metadata-workbench">
            <div className="source-projection" aria-label="Källa med metadatagutter">
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
                          aria-label={`Öppna ${event.kind} på rad ${event.line}`}
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
                  <Button size="sm" variant="outline" onClick={() => onOpenLab("channels")}><RadioTower /> Öppna eventströmmen</Button>
                </>
              ) : <div className="lab-empty">Kör en fixture som emitterar till system.out.</div>}
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
      <code>{String(quote?.exact ?? "") || "Tom källrad"}</code>
      <small>{anchor.target.version} · Unicode code points</small>
    </div>
  );
}

function ChannelLab({ result, onOpenLab }: Pick<PlaygroundOutputProps, "result" | "onOpenLab">) {
  const [tab, setTab] = useState("timeline");
  const events = useMemo(
    () => Object.values(result.channels).flat().sort((left, right) => left.sequence - right.sequence),
    [result.channels],
  );
  const channelNames = useMemo(() => Object.keys(result.channels), [result.channels]);
  const selectedChannel = channelNames.includes(tab) ? tab : null;

  useEffect(() => {
    if (!["timeline", "result", "render", ...channelNames].includes(tab)) setTab("timeline");
  }, [channelNames, tab]);

  return (
    <>
      <LabTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "timeline", label: "Global timeline", count: events.length, icon: Workflow },
          { id: "result", label: "Result JSON", icon: FileJson },
          { id: "render", label: "Render", icon: Sparkles },
          ...channelNames.map((name) => ({ id: name, label: name, count: result.channels[name].length, icon: name === "system.out" ? Rows3 : RadioTower })),
        ]}
      />
      {tab === "render" ? <RenderView output={result.output} /> : null}
      {tab === "result" ? (
        <div className="lab-json-scroll">
          <div className="subset-notice"><CircleDot /> Atomisk playground-envelope · failed runs publicerar tom render och tomma domänkanaler</div>
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
      {tab === "timeline" ? (
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
            <Button size="sm" variant="outline" className="cross-lab-action" onClick={() => onOpenLab("editor")}><PanelRight /> Visa metadata i editorn</Button>
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
      {props.lab === "editor" ? <EditorLab result={props.result} previousResult={props.previousResult} onOpenLab={props.onOpenLab} /> : null}
      {props.lab === "channels" ? <ChannelLab result={props.result} onOpenLab={props.onOpenLab} /> : null}
    </ResultShell>
  );
}
