import type { JSONContent } from "@tiptap/core";
import type { EditorDocument } from "../../shared/types";

const API_BASE = "http://localhost:3001";

export interface SaveDocumentResponse {
  id: string;
}

export interface LoadDocumentResponse {
  id: string;
  title: string;
  content: JSONContent;
  created_at?: string;
  updated_at?: string;
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
  const data = (await res.json()) as { id?: string; error?: string };
  if (!res.ok) throw new Error(String(data.error ?? res.statusText));
  if (typeof data.id !== "string") throw new Error("Invalid save response");
  return { id: data.id };
}

export async function load(id: string): Promise<LoadDocumentResponse> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`);
  const data = (await res.json()) as EditorDocument & { error?: string };
  if (!res.ok) throw new Error(String(data.error ?? res.statusText));
  if (typeof data.title !== "string") throw new Error("Invalid document: missing title");
  if (data.content === undefined || data.content === null) throw new Error("Invalid document: missing content");
  return {
    id: data.id ?? id,
    title: data.title,
    content: data.content,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
