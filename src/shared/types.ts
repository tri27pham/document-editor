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

export interface LayoutResult {
  pageBreaks: number[];
  textStartY: number[];
  pageCount: number;
}
