"""Host-neutral Textabana JSON-message client and Jupyter projection helper."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, Mapping


@dataclass
class TextabanaClient:
    send_message: Callable[[Mapping[str, Any]], None]
    sequence: int = 0
    pending: Dict[str, Callable[[Mapping[str, Any]], None]] = field(default_factory=dict)
    streams: Dict[str, list[Callable[[Mapping[str, Any]], None]]] = field(default_factory=dict)

    def command(self, command: str, payload: Mapping[str, Any] | None = None, callback: Callable[[Mapping[str, Any]], None] | None = None) -> str:
        self.sequence += 1
        request_id = f"python:{command}:{self.sequence}"
        message = dict(payload or {})
        message.update(type=command, requestId=request_id)
        if callback:
            self.pending[request_id] = callback
        self.send_message(message)
        return request_id

    def receive(self, message: Mapping[str, Any]) -> None:
        if message.get("type") == "metadata-chunk":
            for listener in self.streams.get(str(message.get("subscriptionId")), []):
                listener(message)
            return
        callback = self.pending.pop(str(message.get("requestId")), None)
        if callback:
            callback(message)

    def open(self, document_id: str, path: str, source: str, callback=None) -> str:
        return self.command("open", {"document": {"documentId": document_id, "path": path, "source": source, "documentRevision": 1}}, callback)

    def change(self, document_id: str, base_revision: int, changes: Iterable[Mapping[str, Any]], callback=None) -> str:
        return self.command("change", {"documentId": document_id, "baseRevision": base_revision, "coordinateUnit": "unicode-code-point", "changes": list(changes)}, callback)

    def run(self, document_id: str, revision: int, run_id: int, modules: Iterable[Mapping[str, Any]], options: Mapping[str, Any] | None = None, callback=None) -> str:
        return self.command("run", {"documentId": document_id, "documentRevision": revision, "runId": run_id, "modules": list(modules), "options": dict(options or {})}, callback)


def jupyter_mime_bundle(run_result: Mapping[str, Any]) -> Dict[str, Any]:
    """Project a committed Textabana run to a display_data-compatible MIME bundle."""
    if not run_result.get("ok") or not run_result.get("resultEnvelope", {}).get("run", {}).get("committed"):
        raise ValueError("Only committed Textabana results can be displayed as current output.")
    return {
        "text/plain": str(run_result.get("output", "")),
        "text/markdown": str(run_result.get("output", "")),
        "application/vnd.textabana.result+json": run_result["resultEnvelope"],
    }
