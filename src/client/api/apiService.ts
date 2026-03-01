import type { JSONContent } from "@tiptap/core";
import type { EditorDocument } from "../../shared/types";

/** API base URL. Override with VITE_API_BASE in .env for different environments. */
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

/** Response from POST /documents on success. */
export interface SaveDocumentResponse {
  id: string;
}

export async function saveDocument(params: {
  id?: string;
  title?: string;
  content?: JSONContent;
}): Promise<SaveDocumentResponse> {
  const { id, title, content } = params;
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(String((data as { error?: string }).error ?? res.statusText));
  return data as SaveDocumentResponse;
}

export async function load(id: string): Promise<EditorDocument> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(String((data as { error?: string }).error ?? res.statusText));
  return data as EditorDocument;
}
