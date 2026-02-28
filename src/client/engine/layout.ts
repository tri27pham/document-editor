import type { Editor } from "@tiptap/core";
import type { LayoutResult } from "../../shared/types";

export interface ParagraphMeasurement {
  height: number;
  pmPos: number;
}

/**
 * Walk editor.state.doc in lockstep with the live DOM to collect
 * getBoundingClientRect().height and the ProseMirror offset for each
 * top-level node. The offset from doc.forEach is the position needed
 * later for Decoration.node(from, to, …).
 */
export function measureParagraphs(editor: Editor): ParagraphMeasurement[] {
  const { doc } = editor.state;
  const { view } = editor;
  const measurements: ParagraphMeasurement[] = [];

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      measurements.push({
        height: dom.getBoundingClientRect().height,
        pmPos: offset,
      });
    }
  });

  return measurements;
}

/**
 * Pure layout function: reads paragraph measurements, returns page break positions.
 *
 * Pass 1: batch-read paragraph heights from dirty point onwards.
 * Pass 2: line-level measurement on boundary paragraphs only.
 */
export function computeLayout(
  _paragraphHeights: number[],
  _contentHeight: number
): LayoutResult {
  // TODO: implement pagination algorithm (Phase 3)
  return { pageCount: 1, pageStartPositions: [] };
}
