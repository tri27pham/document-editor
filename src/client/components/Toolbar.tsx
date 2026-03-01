import { useState } from "react";
import { useCurrentEditor } from "@tiptap/react";
import { saveDocument, load } from "../api/apiService";

export function Toolbar() {
  const { editor } = useCurrentEditor();
  const [documentId, setDocumentId] = useState<string>("");
  const [loadId, setLoadId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!editor) return;
    setError(null);
    try {
      const json = editor.getJSON();
      const res = await saveDocument({
        id: documentId || undefined,
        title: title || "Untitled",
        content: json,
      });
      setDocumentId(res.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function handleLoad() {
    if (!editor || !loadId.trim()) return;
    setError(null);
    try {
      const doc = await load(loadId.trim());
      if (doc.title != null) setTitle(String(doc.title));
      if (doc.content != null) editor.commands.setContent(doc.content);
      setDocumentId(loadId.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  return (
    <div className="toolbar">
      <button onClick={handleSave} disabled={!editor}>
        Save
      </button>
      <span className="toolbar-divider" />
      <input
        type="text"
        placeholder="Document Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="text"
        placeholder="Load by ID"
        value={loadId}
        onChange={(e) => setLoadId(e.target.value)}
      />
      <button onClick={handleLoad} disabled={!editor || !loadId.trim()}>
        Load
      </button>
      {documentId && <span className="toolbar-id">ID: {documentId}</span>}
      {error && <span className="toolbar-error">{error}</span>}
    </div>
  );
}
