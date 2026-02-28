export interface Run {
  text: string;
  style?: Record<string, unknown>;
}

export interface Paragraph {
  runs: Run[];
}

export interface EditorDocument {
  id?: string;
  title: string;
  content: Paragraph[];
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
