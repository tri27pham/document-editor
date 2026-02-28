import type { Document } from "../../shared/types";

export async function saveDocument(
  _doc: Pick<Document, "title" | "content">
): Promise<{ id: string }> {
  // TODO: POST /documents
  throw new Error("Not implemented");
}

export async function loadDocument(_id: string): Promise<Document> {
  // TODO: GET /documents/:id
  throw new Error("Not implemented");
}
