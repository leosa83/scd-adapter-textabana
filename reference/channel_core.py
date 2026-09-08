#!/usr/bin/env python3
"""Independent bounded channel state and scoped expression execution."""
import copy
import hashlib
import json
import re
import sys
from scoped_text import parse, lower
from text_core import MAX_RENDER, Rejected, reject, evaluate as text_transform

PROFILE = "textabana.channel-core/v1"
JS_WHITESPACE = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
EMITTERS = {"publish", "publishRow", "fanout", "burst", "publishMutable", "publishThenFail", "declareOnly", "invalidEvent"}
PAYLOAD_SCHEMA = {"type": "object", "required": ["text", "label", "meta"], "properties": {"text": {"type": "string"}, "label": {"type": "string"}, "meta": {"type": "object"}}}


def descriptor(name, persistence="durable", required=False):
    return {"name": name, "payloadKind": "object", "mediaType": "application/json", "schemaRef": "textabana.channel-core/payload-v1", "delivery": "snapshot", "persistence": persistence, "ordering": "global-sequence", "key": ["payload.label"], "required": required, "sensitivity": "internal", "declared": True, "schema": copy.deepcopy(PAYLOAD_SCHEMA)}


def integer(raw, maximum, zero=False):
    if len(raw) > 7 or not re.fullmatch(r"0|[1-9][0-9]*", raw):
        reject("stage")
    value = int(raw)
    if value > maximum or (not zero and value == 0):
        reject("stage")
    return value


def payload(input, args):
    return {"text": input, "label": args.get("label", ""), "meta": {"id": args.get("id", "user-id"), "runId": args.get("runId", "user-run"), "duration": args.get("duration", "user-duration"), "nested": {"stageId": args.get("stageId", "user-stage")}}}


def run(source):
    try:
        root, direction = parse(source)
        expression = lower(root, direction)
        stages, events = [], []
        descriptors = {"system.out": {"name": "system.out", "payloadKind": "object", "mediaType": "application/json", "schemaRef": "textabana.system.out/v2", "delivery": "snapshot", "persistence": "durable", "ordering": "global-sequence", "key": ["target.anchorRef"], "required": False, "sensitivity": "internal", "declared": True}}

        descriptors["diagnostics"] = {**descriptors["system.out"], "name": "diagnostics", "schemaRef": "textabana.diagnostic/v1", "persistence": "transient", "key": []}

        def emit(channel, value, args, stage, mode):
            if len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) > 16384:
                reject("limit")
            channel = channel.strip(JS_WHITESPACE)
            if channel not in descriptors:
                reject("stage")
            if len(events) >= 64:
                reject("limit")
            target = {"mode": mode, "rowId": args.get("rowId", "row"), "row": integer(args.get("row", "1"), 1000000), "rowSet": args.get("rowSet") or "profile"}
            events.append({"sequence": len(events) + 1, "channel": channel, "kind": args.get("kind") or ("diagnostic" if channel == "diagnostics" else "annotation" if channel == "system.out" else "event"), "phase": "run", "state": "committed", "payload": copy.deepcopy(value), "target": target, "stage": stage})

        def evaluate(node):
            if isinstance(node, str):
                return node
            if node["kind"] == "merge":
                return "".join(evaluate(item) for item in node["items"])
            input = evaluate(node["input"])
            function, args = node["stage"]["name"], node["stage"]["args"]
            ordinal = len(stages) + 1
            if function not in EMITTERS:
                output = text_transform({"children": [input], "pipeline": [(function, args)]})
            else:
                if function == "declareOnly":
                    descriptors.setdefault("required.empty", descriptor("required.empty", required=True))
                    descriptors.setdefault("optional.empty", descriptor("optional.empty"))
                else:
                    for name in ("records", "audit", "progress"):
                        descriptors.setdefault(name, descriptor(name, "transient" if name == "progress" else "durable"))
                    mode = "row" if function == "publishRow" else args.get("mode", "line")
                    if mode not in ("line", "row"):
                        reject("stage")
                    integer(args.get("row", "1"), 1000000)
                    value = payload(input, args)
                    channel = "system.out" if function == "publishRow" else args.get("channel", "records")
                    if function == "invalidEvent":
                        reject("stage")
                    if function == "fanout":
                        for name in ("records", "progress", "audit", "system.out"):
                            emit(name, value, args, ordinal, mode)
                    elif function == "burst":
                        for _ in range(integer(args.get("count", "1"), 128, zero=True)):
                            emit(channel, value, args, ordinal, mode)
                    else:
                        emit(channel, value, args, ordinal, mode)
                        if function == "publishMutable":
                            value["label"] = "changed"
                            value["meta"]["nested"]["stageId"] = "changed-stage"
                            emit(channel, value, args, ordinal, mode)
                        if function == "publishThenFail":
                            reject("stage")
                output = input
            stages.append({"function": function, "args": args, "modality": "block" if node["scope"] is None else "interval", "scopeId": node["scope"]})
            return output

        output = evaluate(expression)
        if len(output.encode("utf-8")) > MAX_RENDER:
            reject("limit")
        snapshots = {}
        for name, desc in descriptors.items():
            sequences = [event["sequence"] for event in events if event["channel"] == name]
            if desc["persistence"] != "transient" and (sequences or desc["required"]):
                snapshots[name] = {"descriptor": desc, "events": sequences}
        return {"ok": True, "output": output, "error": None, "committed": True, "committedStages": len(stages), "stages": stages, "events": events, "snapshots": snapshots}
    except Rejected as error:
        return {"ok": False, "output": "", "error": error.phase, "committed": False, "committedStages": 0, "stages": [], "events": [], "snapshots": {}}


def main():
    status = 0
    if sys.argv[1:] == ["batch"]:
        result = {"profile": PROFILE, "results": [run(source) for source in json.load(sys.stdin)["sources"]]}
    elif len(sys.argv) == 3 and sys.argv[1] == "run":
        source = open(sys.argv[2], "rb").read().decode("utf-8", "strict")
        result = {"profile": PROFILE, "sourceDigest": "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest(), "result": run(source)}
        status = 0 if result["result"]["ok"] else 1
    else:
        raise ValueError("Usage: python3 reference/channel_core.py run <document.md> | batch")
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
