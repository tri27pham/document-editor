import type { EditorDocument } from "../../shared/types";

export async function saveDocument(
  _doc: Pick<EditorDocument, "title" | "content">
): Promise<{ id: string }> {
  // TODO: POST /documents
  throw new Error("Not implemented");
}

export async function loadDocument(_id: string): Promise<EditorDocument> {
  // TODO: GET /documents/:id
  throw new Error("Not implemented");
}
