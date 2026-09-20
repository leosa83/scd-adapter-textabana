"""Run the shipped Python client against the real JSONL Worker transport."""
import json
from pathlib import Path
import select
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from sdk.python.textabana_client import TextabanaClient, jupyter_mime_bundle

configuration = json.loads(subprocess.check_output(
    ["node", str(ROOT / "examples/integration/package.mjs")], cwd=ROOT, text=True,
))
process = subprocess.Popen(
    ["node", str(ROOT / "cli/textabana.mjs"), "serve"],
    cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1,
)


def send(message):
    process.stdin.write(json.dumps(message) + "\n")
    process.stdin.flush()


client = TextabanaClient(send)


def request(command, payload):
    replies = []
    client.command(command, payload, replies.append)
    deadline = time.monotonic() + 15
    while not replies:
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
            raise TimeoutError(command)
        line = process.stdout.readline()
        if not line:
            raise RuntimeError("Transport closed")
        client.receive(json.loads(line))
    response = replies[0]
    if not response.get("ok"):
        raise RuntimeError(response.get("error"))
    return response


try:
    source = (ROOT / "examples/integration/document.md").read_text(encoding="utf-8")
    opened = request("open", {"document": {"documentId": "python-docs", "path": "examples/integration/document.md", "source": source}})
    result = request("run", {**configuration, "documentId": "python-docs", "documentRevision": opened["document"]["documentRevision"], "runId": 1})
    bundle = jupyter_mime_bundle(result)
    assert bundle["text/plain"] == "HEJ 🌊\n"
    assert bundle["text/markdown"] == bundle["text/plain"]
    assert bundle["application/vnd.textabana.result+json"]["run"]["committed"]
    print(json.dumps({"status": "passed", "mimeTypes": sorted(bundle), "output": result["output"]}, ensure_ascii=False))
finally:
    client.dispose()
    process.stdin.close()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.terminate()
        process.wait(timeout=5)
