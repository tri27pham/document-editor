import type { Editor } from "@tiptap/core";
import type { LayoutResult, PageStartPosition } from "../../shared/types";
import { PARAGRAPH_SPACING } from "../../shared/constants";

export interface ParagraphMeasurement {
  height: number;
  pmPos: number;
}

/**
 * Walk editor.state.doc in lockstep with the live DOM to collect
 * getBoundingClientRect().height and the ProseMirror offset for each
 * top-level node. The offset from doc.forEach is the position needed
 * later for Decoration.node(from, to, …).
 * Uses Element (not only HTMLElement) so SVG and other custom node views are measured.
 * Nodes with no DOM or non-Element DOM (e.g. Text) are skipped; the caller must
 * check that measurements.length === doc.childCount before using the result.
 */
export function measureParagraphs(editor: Editor): ParagraphMeasurement[] {
  const { doc } = editor.state;
  const { view } = editor;
  const measurements: ParagraphMeasurement[] = [];

  doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof Element) {
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
 * Whole-paragraph pushing (V1): when a paragraph doesn't fit on the current page,
 * the entire paragraph moves to the next page. Straddling paragraphs are logged
 * as candidates for future mid-paragraph splitting.
 * Paragraph spacing (PARAGRAPH_SPACING constant) is included so each paragraph reserves height + gap.
 */
export function computeLayout(
  measurements: ParagraphMeasurement[],
  contentHeight: number
): LayoutResult {
  let pageCount = 1;
  let accumulatedHeightOnCurrentPage = 0;
  const pageStartPositions: PageStartPosition[] = [];

  for (const p of measurements) {
    const remainingOnPage = contentHeight - accumulatedHeightOnCurrentPage;
    const spaceNeeded = p.height + PARAGRAPH_SPACING;

    if (spaceNeeded > remainingOnPage) {
      pageStartPositions.push({
        proseMirrorPos: p.pmPos,
        pageNumber: pageCount + 1,
        remainingSpace: remainingOnPage,
      });
      pageCount += 1;
      accumulatedHeightOnCurrentPage = p.height + PARAGRAPH_SPACING;
    } else {
      accumulatedHeightOnCurrentPage += p.height + PARAGRAPH_SPACING;
    }
  }

  return { pageCount, pageStartPositions };
}
