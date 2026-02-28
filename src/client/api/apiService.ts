import type { JSONContent } from "@tiptap/core";

const API_BASE = "http://localhost:3001";

export async function saveDocument(params: {
  id?: string;
  title?: string;
  content?: JSONContent;
}): Promise<unknown> {
  const { id, title, content } = params;
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(String((data as { error?: string }).error ?? res.statusText));
  return data;
}

export async function load(id: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/documents/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(String((data as { error?: string }).error ?? res.statusText));
  return data;
}
