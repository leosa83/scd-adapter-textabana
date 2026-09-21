"""Host-neutral Textabana JSON-message client and Jupyter projection helper."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Iterable, Mapping


@dataclass
class TextabanaClient:
    """Callback-based client; the host owns transport I/O and accepted revisions.

    Feed decoded incoming messages to receive(). Failed responses reach callbacks
    unchanged. Handle transport death in the host and call dispose() to settle
    pending callbacks; this class does not manage a subprocess or an event loop.
    """
    send_message: Callable[[Mapping[str, Any]], None]
    sequence: int = 0
    pending: Dict[str, Callable[[Mapping[str, Any]], None]] = field(default_factory=dict)
    streams: Dict[str, list[Callable[[Mapping[str, Any]], None]]] = field(default_factory=dict)
    disposed: bool = False

    def command(self, command: str, payload: Mapping[str, Any] | None = None, callback: Callable[[Mapping[str, Any]], None] | None = None) -> str:
        """Send a correlated command and return its request ID, not its result.

        A synchronous send failure removes the pending callback and propagates.
        The generated type/requestId fields override any supplied payload fields.
        """
        if self.disposed:
            raise RuntimeError("Textabana client disposed")
        self.sequence += 1
        request_id = f"python:{command}:{self.sequence}"
        message = dict(payload or {})
        message.update(type=command, requestId=request_id)
        if callback:
            self.pending[request_id] = callback
        try:
            self.send_message(message)
        except Exception:
            self.pending.pop(request_id, None)
            raise
        return request_id

    def dispose(self) -> None:
        """Clear listeners and notify pending callbacks with HOST-CLOSED."""
        self.disposed = True
        pending, self.pending = self.pending, {}
        self.streams.clear()
        for request_id, callback in pending.items():
            callback({"ok": False, "requestId": request_id, "error": {"code": "HOST-CLOSED", "message": "Client disposed"}})

    def receive(self, message: Mapping[str, Any]) -> None:
        """Route a reply or metadata chunk; ok=False is delivered, not raised."""
        if message.get("type") == "metadata-chunk":
            for listener in self.streams.get(str(message.get("subscriptionId")), []):
                listener(message)
            return
        callback = self.pending.pop(str(message.get("requestId")), None)
        if callback:
            callback(message)

    def open(self, document_id: str, path: str, source: str, callback=None) -> str:
        """Request revision 1; read the accepted revision from the callback."""
        return self.command("open", {"document": {"documentId": document_id, "path": path, "source": source, "documentRevision": 1}}, callback)

    def change(self, document_id: str, base_revision: int, changes: Iterable[Mapping[str, Any]], callback=None) -> str:
        """Send half-open code-point edits against the accepted base revision."""
        return self.command("change", {"documentId": document_id, "baseRevision": base_revision, "coordinateUnit": "unicode-code-point", "changes": list(changes)}, callback)

    def run(self, document_id: str, revision: int, run_id: int, modules: Iterable[Mapping[str, Any]], options: Mapping[str, Any] | None = None, callback=None) -> str:
        """Execute a captured document revision; inspect the callback for commit."""
        return self.command("run", {"documentId": document_id, "documentRevision": revision, "runId": run_id, "modules": list(modules), "options": dict(options or {})}, callback)


def jupyter_mime_bundle(run_result: Mapping[str, Any]) -> Dict[str, Any]:
    """Project a committed run to a display_data-compatible MIME bundle.

    Raise ValueError for failed or uncommitted runs. The JSON value references
    the supplied resultEnvelope. This does not send Jupyter protocol messages.
    """
    if not run_result.get("ok") or not run_result.get("resultEnvelope", {}).get("run", {}).get("committed"):
        raise ValueError("Only committed Textabana results can be displayed as current output.")
    return {
        "text/plain": str(run_result.get("output", "")),
        "text/markdown": str(run_result.get("output", "")),
        "application/vnd.textabana.result+json": run_result["resultEnvelope"],
    }
