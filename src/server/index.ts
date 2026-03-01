import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import type { EditorDocument } from "../shared/types";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const documents = new Map<string, EditorDocument>();

app.post("/documents", (req, res) => {
  const { id: bodyId, title, content } = req.body as {
    id?: string;
    title?: string;
    content?: EditorDocument["content"];
  };
  if (title === undefined || content === undefined) {
    res.status(400).json({ error: "Missing or invalid title or content" });
    return;
  }
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    res.status(400).json({ error: "Invalid content: must be a document object" });
    return;
  }
  const now = new Date().toISOString();

  if (bodyId != null && typeof bodyId === "string" && documents.has(bodyId)) {
    const existing = documents.get(bodyId)!;
    const updated: EditorDocument = {
      ...existing,
      title: String(title),
      content,
      updated_at: now,
    };
    documents.set(bodyId, updated);
    res.status(200).json({ id: bodyId });
    return;
  }

  const id = randomUUID();
  const doc: EditorDocument = {
    id,
    title: String(title),
    content,
    created_at: now,
    updated_at: now,
  };
  documents.set(id, doc);
  res.status(201).json({ id });
});

app.get("/documents/:id", (req, res) => {
  const doc = documents.get(req.params.id);
  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(doc);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
