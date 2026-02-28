export interface DocumentPayload {
  id?: string;
  title: string;
  content: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export async function saveDocument(
  _doc: Omit<DocumentPayload, "id" | "created_at" | "updated_at">
): Promise<{ id: string }> {
  // TODO: POST /documents
  throw new Error("Not implemented");
}

export async function loadDocument(_id: string): Promise<DocumentPayload> {
  // TODO: GET /documents/:id
  throw new Error("Not implemented");
}
