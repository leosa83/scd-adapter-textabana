#!/usr/bin/env python3
"""Independent textabana.text-core/v1 parser/evaluator. Python standard library only."""
import hashlib
import json
import re
import sys

PROFILE = "textabana.text-core/v1"
NAME = r"[A-Za-z_][A-Za-z0-9_]*"
MAX_SOURCE = 65536
MAX_DEPTH = 32
MAX_STAGES = 128
MAX_RENDER = 262144


class Rejected(Exception):
    def __init__(self, phase):
        self.phase = phase


def reject(phase):
    raise Rejected(phase)


def scalar(value):
    try:
        value.encode("utf-8", "strict")
    except UnicodeError:
        reject("unsupported")
    return value


def pipeline(header):
    """Scan quoted arguments before recognizing separators; never execute source."""
    stages = []
    at = 0
    decoder = json.JSONDecoder()
    while True:
        while at < len(header) and header[at] in " \t":
            at += 1
        match = re.match(NAME, header[at:])
        if not match:
            reject("syntax" if at == len(header) or header[at] == "|" else "unsupported")
        name = match[0]
        at += len(name)
        args = {}
        while at < len(header):
            if header[at] == "|":
                break
            if header[at] not in " \t":
                reject("unsupported")
            while at < len(header) and header[at] in " \t":
                at += 1
            if at == len(header) or header[at] == "|":
                break
            key = re.match(NAME + "=", header[at:])
            if not key:
                reject("unsupported")
            at += len(key[0])
            if at == len(header) or header[at] != '"':
                reject("unsupported")
            try:
                value, end = decoder.raw_decode(header, at)
            except ValueError:
                reject("syntax")
            key = key[0][:-1]
            if key in args or key in ("__proto__", "constructor", "prototype"):
                reject("syntax")
            args[key] = scalar(value)
            at = end
        stages.append((name, args))
        if at == len(header):
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
    root = {"children": [], "pipeline": []}
    stack = [root]
    fence = None
    stage_count = 0
    # splitlines() would incorrectly turn U+2028/U+0085 into line boundaries.
    lines = source.split("\n")
    for index, line in enumerate(lines):
        text = line + ("\n" if index < len(lines) - 1 else "")
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})([^\n\u2028\u2029]*)$", line)
        if fence:
            stack[-1]["children"].append(text)
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip(" \t\v\f\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"):
                fence = None
            continue
        if marker:
            fence = marker[1]
            stack[-1]["children"].append(text)
            continue
        escaped = re.match(r"^([ \t]*)\\(>>>>|<<<<)", line)
        if escaped:
            offset = len(escaped[1])
            stack[-1]["children"].append(text[:offset] + text[offset + 1:])
            continue
        clean = line.lstrip(" \t")
        if clean.startswith((">>>>!", ">>>>+", "<<<<+")) or re.match(r"^[ \t]+\|", line):
            reject("unsupported")
        if clean.startswith(">>>>"):
            header = clean[4:].strip(" \t")
            stages = pipeline(header)
            stage_count += len(stages)
            if stage_count > MAX_STAGES or len(stack) > MAX_DEPTH:
                reject("limit")
            block = {"pipeline": stages, "children": []}
            stack[-1]["children"].append(block)
            stack.append(block)
        elif clean.startswith("<<<<"):
            name = clean[4:].strip(" \t")
            if not re.fullmatch(NAME, name) or len(stack) == 1 or name != stack[-1]["pipeline"][0][0]:
                reject("syntax")
            stack.pop()
        elif clean.startswith((">>>", "<<<")):
            reject("syntax")
        elif "{" in line:
            reject("unsupported")
        else:
            stack[-1]["children"].append(text)
    if len(stack) != 1:
        reject("syntax")
    return root, stage_count


def evaluate(node):
    value = "".join(item if isinstance(item, str) else evaluate(item) for item in node["children"])
    for name, args in node["pipeline"]:
        if name == "identity":
            pass
        elif name == "asciiUpper":
            value = value.translate(str.maketrans("abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
        elif name == "wrap":
            value = args.get("prefix", "") + value + args.get("suffix", "")
        elif name == "replaceLiteral":
            old = args.get("old", "")
            if not old:
                reject("stage")
            new = args.get("new", "")
            if len(value.encode("utf-8")) + value.count(old) * (len(new.encode("utf-8")) - len(old.encode("utf-8"))) > MAX_RENDER:
                reject("limit")
            value = value.replace(old, new)
        else:
            # Includes the deliberately failing `fail` stage.
            reject("stage")
        if len(value.encode("utf-8")) > MAX_RENDER:
            reject("limit")
    return value


def run(source):
    try:
        root, count = parse(source)
        output = evaluate(root)
        if len(output.encode("utf-8")) > MAX_RENDER:
            reject("limit")
        return {"ok": True, "output": output, "error": None, "committed": True, "committedStages": count}
    except Rejected as error:
        return {"ok": False, "output": "", "error": error.phase, "committed": False, "committedStages": 0}


def main():
    exit_code = 0
    if len(sys.argv) == 2 and sys.argv[1] == "batch":
        sources = json.load(sys.stdin)["sources"]
        result = {"profile": PROFILE, "results": [run(source) for source in sources]}
    elif len(sys.argv) == 3 and sys.argv[1] == "run":
        source = open(sys.argv[2], "rb").read().decode("utf-8", "strict")
        result = {"profile": PROFILE, "sourceDigest": "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest(), "result": run(source)}
        if not result["result"]["ok"]:
            exit_code = 1
    else:
        raise ValueError("Usage: python3 reference/text_core.py run <document.md> | batch")
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
