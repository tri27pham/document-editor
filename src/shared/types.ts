import type { JSONContent } from "@tiptap/core";

export interface EditorDocument {
  id?: string;
  title: string;
  content: JSONContent;
  created_at?: string;
  updated_at?: string;
}

export interface PageStartPosition {
  proseMirrorPos: number;
  pageNumber: number;
  remainingSpace: number;
}

export interface LayoutResult {
  pageCount: number;
  pageStartPositions: PageStartPosition[];
}
