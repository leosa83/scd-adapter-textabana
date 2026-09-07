#!/usr/bin/env python3
"""Independent scoped-text parser, lowering and evaluation; no JavaScript runtime."""
import hashlib
import json
import re
import sys
from text_core import NAME, MAX_SOURCE, MAX_DEPTH, MAX_STAGES, MAX_RENDER, Rejected, reject, scalar, evaluate as text_transform

PROFILE = "textabana.scoped-text/v1"
ALIAS = r"[A-Za-z_][A-Za-z0-9_.-]*"
JS_SPACE = " \t\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"


def pipeline(header, context):
    stages, at = [], 0
    decoder = json.JSONDecoder()
    while True:
        while at < len(header) and header[at] in " \t":
            at += 1
        match = re.match(NAME, header[at:])
        if not match:
            reject("syntax" if at == len(header) or header[at] == "|" else "unsupported")
        name = match[0]
        at += len(name)
        args, controls, seen = {}, {}, set()
        while at < len(header):
            if header[at] == "|":
                break
            if header[at] not in " \t":
                reject("unsupported")
            while at < len(header) and header[at] in " \t":
                at += 1
            if at == len(header) or header[at] == "|":
                break
            match = re.match(r"@?" + NAME + "=", header[at:])
            if not match:
                reject("syntax" if header[at] == '"' else "unsupported")
            key = match[0][:-1]
            at += len(match[0])
            if key in seen or key in ("__proto__", "constructor", "prototype"):
                reject("syntax")
            seen.add(key)
            allowed = {"@id", "@order"} if context == "interval" else {"@inherit"} if not stages else set()
            if key.startswith("@") and key not in allowed:
                reject("unsupported")
            if at == len(header):
                reject("unsupported")
            if key == "@order":
                number = re.match(r"-?(?:0|[1-9][0-9]*)(?=[ \t|]|$)", header[at:])
                if not number or len(number[0].lstrip("-")) > 7:
                    reject("unsupported")
                value, end = int(number[0]), at + len(number[0])
                if abs(value) > 1000000:
                    reject("unsupported")
            else:
                if header[at] != '"':
                    reject("unsupported")
                try:
                    value, end = decoder.raw_decode(header, at)
                except ValueError:
                    reject("syntax")
                scalar(value)
            at = end
            if at < len(header) and header[at] not in " \t|":
                reject("syntax")
            if key == "@id" and not re.fullmatch(ALIAS, value):
                reject("syntax")
            if key == "@inherit" and value not in ("default", "none"):
                reject("unsupported")
            (controls if key.startswith("@") else args)[key] = value
        stages.append({"name": name, "args": args, "controls": controls})
        if at == len(header):
            if context == "interval" and len(stages) != 1:
                reject("syntax")
            return stages
        at += 1


def parse(source):
    if not isinstance(source, str):
        reject("unsupported")
    scalar(source)
    if "\r" in source or "\ufeff" in source:
        reject("unsupported")
    if len(source.encode("utf-8")) > MAX_SOURCE:
        reject("limit")
    root = {"kind": "block", "id": 0, "children": [], "pipeline": []}
    stack, active = [root], []
    fence, order = None, "asc"
    authored, sequence, block_id = 0, 0, 0
    lines = source.split("\n")
    for index, line in enumerate(lines):
        text = line + ("\n" if index < len(lines) - 1 else "")
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})([^\n\u2028\u2029]*)$", line)
        if fence:
            stack[-1]["children"].append(text)
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip(JS_SPACE):
                fence = None
            continue
        if marker:
            fence = marker[1]
            stack[-1]["children"].append(text)
            continue
        escaped = re.match(r"^([ \t]*)\\(>>>>|<<<<)", line)
        if escaped:
            at = len(escaped[1])
            stack[-1]["children"].append(text[:at] + text[at + 1:])
            continue
        clean = line.lstrip(" \t")
        if re.match(r"^[ \t]+\|", line):
            reject("unsupported")
        if clean.startswith(">>>>!"):
            config = re.fullmatch(r'>>>>![ \t]+config[ \t]+scope-order="declaration:(asc|desc)"[ \t]*', clean)
            if not config or len(stack) != 1:
                reject("unsupported")
            order = config[1]
            stack[-1]["children"].append({"kind": "config"})
        elif clean.startswith(">>>>+"):
            stage = pipeline(clean[5:].strip(" \t"), "interval")[0]
            authored += 1
            sequence += 1
            alias = stage["controls"].get("@id", stage["name"] + "-" + str(sequence))
            if any(scope["id"] == alias for scope in active):
                reject("syntax")
            if len(active) >= 32:
                reject("limit")
            scope = {"id": alias, "stage": stage, "owner": stack[-1]["id"], "order": stage["controls"].get("@order", sequence)}
            active.append(scope)
            stack[-1]["children"].append({"kind": "open", "scope": scope})
        elif clean.startswith("<<<<+"):
            match = re.fullmatch(r"(?:@id=)?(@?" + ALIAS + ")", clean[5:].strip(" \t"))
            if not match:
                reject("syntax")
            target = match[1].removeprefix("@")
            scope = next((s for s in reversed(active) if target in (s["id"], s["stage"]["name"])), None)
            if scope is None or scope["owner"] != stack[-1]["id"]:
                reject("syntax")
            active.remove(scope)
            stack[-1]["children"].append({"kind": "close", "scope": scope})
        elif clean.startswith(">>>>"):
            stages = pipeline(clean[4:].strip(" \t"), "block")
            authored += len(stages)
            if len(stack) > MAX_DEPTH:
                reject("limit")
            block_id += 1
            block = {"kind": "block", "id": block_id, "children": [], "pipeline": stages}
            stack[-1]["children"].append(block)
            stack.append(block)
        elif clean.startswith("<<<<"):
            name = clean[4:].strip(" \t")
            if not re.fullmatch(NAME, name) or len(stack) == 1 or name != stack[-1]["pipeline"][0]["name"]:
                reject("syntax")
            if any(s["owner"] == stack[-1]["id"] for s in active):
                reject("syntax")
            stack.pop()
        elif clean.startswith((">>>", "<<<")):
            reject("syntax")
        elif "{" in line:
            reject("unsupported")
        else:
            stack[-1]["children"].append(text)
        if authored > MAX_STAGES:
            reject("limit")
    if len(stack) != 1 or active:
        reject("syntax")
    return root, order


def lower(root, direction):
    """Build bounded expressions before invoking any transform, including failing stages."""
    planned = 0

    def apply(value, stage, scope=None):
        nonlocal planned
        planned += 1
        if planned > MAX_STAGES:
            reject("limit")
        return {"kind": "apply", "input": value, "stage": stage, "scope": scope}

    def intervals(value, scopes):
        # Python's stable sort retains declaration order for equal numeric order in both directions.
        for scope in sorted(scopes, key=lambda s: s["order"], reverse=direction == "desc"):
            value = apply(value, scope["stage"], scope["id"])
        return value

    def sequence(nodes):
        outputs, buffer, scopes = [], [], []

        def flush():
            if buffer:
                outputs.append(intervals("".join(buffer), scopes))
                buffer.clear()

        for node in nodes:
            if isinstance(node, str):
                buffer.append(node)
                continue
            flush()
            if node["kind"] == "open":
                scopes.append(node["scope"])
            elif node["kind"] == "close":
                scopes.remove(node["scope"])
            elif node["kind"] == "block":
                value = sequence(node["children"])
                for stage in node["pipeline"]:
                    value = apply(value, stage)
                if node["pipeline"][0]["controls"].get("@inherit", "default") != "none":
                    value = intervals(value, scopes)
                outputs.append(value)
        flush()
        return {"kind": "merge", "items": outputs}

    return sequence(root["children"])


def run(source):
    try:
        root, direction = parse(source)
        expression = lower(root, direction)
        ledger = []

        def evaluate(value):
            if isinstance(value, str):
                return value
            if value["kind"] == "merge":
                return "".join(evaluate(item) for item in value["items"])
            stage = value["stage"]
            output = text_transform({"children": [evaluate(value["input"])], "pipeline": [(stage["name"], stage["args"])]})
            ledger.append({"function": stage["name"], "args": stage["args"], "modality": "block" if value["scope"] is None else "interval", "scopeId": value["scope"]})
            return output

        output = evaluate(expression)
        if len(output.encode("utf-8")) > MAX_RENDER:
            reject("limit")
        return {"ok": True, "output": output, "error": None, "committed": True, "committedStages": len(ledger), "stages": ledger}
    except Rejected as error:
        return {"ok": False, "output": "", "error": error.phase, "committed": False, "committedStages": 0, "stages": []}


def main():
    status = 0
    if sys.argv[1:] == ["batch"]:
        result = {"profile": PROFILE, "results": [run(source) for source in json.load(sys.stdin)["sources"]]}
    elif len(sys.argv) == 3 and sys.argv[1] == "run":
        source = open(sys.argv[2], "rb").read().decode("utf-8", "strict")
        result = {"profile": PROFILE, "sourceDigest": "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest(), "result": run(source)}
        status = 0 if result["result"]["ok"] else 1
    else:
        raise ValueError("Usage: python3 reference/scoped_text.py run <document.md> | batch")
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
