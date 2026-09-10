#!/usr/bin/env python3
"""Independent source positions, quoted anchors and event source-map relationships."""
import hashlib
import json
import sys
from channel_core import run as channel_run

PROFILE = "textabana.source-map-core/v1"


def run(source):
    return channel_run(source, source_maps=True)


def main():
    status = 0
    if sys.argv[1:] == ["batch"]:
        result = {"profile": PROFILE, "results": [run(source) for source in json.load(sys.stdin)["sources"]]}
    elif len(sys.argv) == 3 and sys.argv[1] == "run":
        source = open(sys.argv[2], "rb").read().decode("utf-8", "strict")
        result = {"profile": PROFILE, "sourceDigest": "sha256:" + hashlib.sha256(source.encode("utf-8")).hexdigest(), "result": run(source)}
        status = 0 if result["result"]["ok"] else 1
    else:
        raise ValueError("Usage: python3 reference/source_map_core.py run <document.md> | batch")
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
