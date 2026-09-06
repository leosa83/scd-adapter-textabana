"""Execute the versioned host fixtures through the Python SDK and a real JSONL transport."""
import json
import os
from pathlib import Path
import subprocess
import sys
import signal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sdk.python.textabana_client import TextabanaClient, jupyter_mime_bundle


def main():
    def stop(_signal, _frame):
        raise SystemExit("Python conformance host stopped")
    signal.signal(signal.SIGTERM, stop)
    suite = json.loads((ROOT / "conformance/profiles/host-protocol-v1.json").read_text())
    with subprocess.Popen([os.environ.get("TEXTABANA_NODE", "node"), str(ROOT / "cli/textabana.mjs"), "serve"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8") as process:
        def send(message):
            process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            process.stdin.flush()
        client = TextabanaClient(send)
        transcript = []
        try:
            for fixture in suite["cases"]:
                replies = []
                client.command(fixture["command"], fixture["payload"], replies.append)
                while not replies:
                    line = process.stdout.readline()
                    if not line:
                        raise RuntimeError("Kernel transport closed before response")
                    client.receive(json.loads(line))
                response = replies[0]
                if fixture["id"] == "committed-run":
                    assert jupyter_mime_bundle(response)["text/plain"] == fixture["expect"]["output"]
                transcript.append({"id": fixture["id"], "response": response})
        finally:
            client.dispose()
            process.stdin.close()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    print(json.dumps(transcript, ensure_ascii=False))


if __name__ == "__main__":
    main()
