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

/** Gap value for page starters (remainingSpace + margins + gap). Used by decoration plugin. */
export interface PageEntryDecoration {
  marginTop: number;
}

/** Lines 0..splitAfterLine stay on current page; rest overflow. sourceProseMirrorPos for split transaction. */
export interface PageEntrySplit {
  splitAfterLine: number;
  sourceProseMirrorPos: number;
}

/**
 * One item in the page layout list. Built by the pagination walk (Phase 10c).
 * Entries with decoration !== null start a new page. Entries with split !== null need a split transaction.
 */
export interface PageEntry {
  height: number;
  lineRects: DOMRect[];
  decoration: PageEntryDecoration | null;
  split: PageEntrySplit | null;
}
