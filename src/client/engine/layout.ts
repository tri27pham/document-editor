import type { Editor } from "@tiptap/core";
import type { LayoutResult, PageStartPosition } from "../../shared/types";

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
 * Whole-paragraph pushing (V1): when a paragraph doesn't fit on the current page,
 * the entire paragraph moves to the next page. Straddling paragraphs are logged
 * as candidates for future mid-paragraph splitting.
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

    if (p.height > remainingOnPage) {
      // Whole paragraph doesn't fit; move to next page
      console.log("[layout] Straddling paragraph (candidate for mid-paragraph split):", {
        pmPos: p.pmPos,
        height: p.height,
        remainingOnPage,
      });
      pageStartPositions.push({
        proseMirrorPos: p.pmPos,
        pageNumber: pageCount + 1,
        remainingSpace: remainingOnPage,
      });
      pageCount += 1;
      accumulatedHeightOnCurrentPage = p.height;
    } else {
      accumulatedHeightOnCurrentPage += p.height;
    }
  }

  return { pageCount, pageStartPositions };
}
