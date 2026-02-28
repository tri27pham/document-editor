import { useState } from "react";

export function Toolbar() {
  const [documentId, setDocumentId] = useState<string>("");
  const [loadId, setLoadId] = useState<string>("");

  function handleSave() {
    // TODO: call save API, set documentId from response
  }

  function handleLoad() {
    // TODO: call load API with loadId, set editor content
  }

  return (
    <div className="toolbar">
      <button onClick={handleSave}>Save</button>
      <span className="toolbar-divider" />
      <input
        type="text"
        placeholder="Document ID"
        value={loadId}
        onChange={(e) => setLoadId(e.target.value)}
      />
      <button onClick={handleLoad}>Load</button>
      {documentId && <span className="toolbar-id">ID: {documentId}</span>}
    </div>
  );
}
