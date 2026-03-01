import type { Editor } from "@tiptap/core";
import type { LayoutResult, PageStartPosition } from "../../shared/types";
import { PARAGRAPH_SPACING } from "../../shared/constants";

/**
 * Per-paragraph data collected in a single DOM read pass for pagination.
 * proseMirrorPos is used as split.sourceProseMirrorPos during split transactions.
 * lineRects from Range.getClientRects() support mid-paragraph split resolution.
 */
export interface ParagraphMeasurement {
  proseMirrorPos: number;
  totalHeight: number;
  lineRects: DOMRect[];
}

/**
 * Collect per-line client rects for a paragraph element. Works with mixed
 * inline content (bold, italic, links). Each rect's height reflects the
 * actual rendered line height. Returns a snapshot (new DOMRects) so layout
 * can use the data after the DOM read phase without holding live references.
 */
function getLineRects(paragraphElement: HTMLElement): DOMRect[] {
  const range = document.createRange();
  range.selectNodeContents(paragraphElement);
  const rects = range.getClientRects();
  return Array.from(rects).map(
    (r) => new DOMRect(r.x, r.y, r.width, r.height)
  );
}

/**
 * Walk editor.state.doc in lockstep with the live DOM to collect, in a single
 * read pass: getBoundingClientRect().height, per-line rects (Range.getClientRects),
 * and ProseMirror offset for each top-level node.
 */
export function measureParagraphs(editor: Editor): ParagraphMeasurement[] {
  const { doc } = editor.state;
  const { view } = editor;
  const measurements: ParagraphMeasurement[] = [];

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (dom instanceof HTMLElement) {
      measurements.push({
        proseMirrorPos: offset,
        totalHeight: dom.getBoundingClientRect().height,
        lineRects: getLineRects(dom),
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
    const spaceNeeded = p.totalHeight + PARAGRAPH_SPACING;

    if (spaceNeeded > remainingOnPage) {
      if (p.totalHeight > remainingOnPage) {
        console.log("[layout] Straddling paragraph (candidate for mid-paragraph split):", {
          pmPos: p.proseMirrorPos,
          height: p.totalHeight,
          remainingOnPage,
        });
      }
      pageStartPositions.push({
        proseMirrorPos: p.proseMirrorPos,
        pageNumber: pageCount + 1,
        remainingSpace: remainingOnPage,
      });
      pageCount += 1;
      accumulatedHeightOnCurrentPage = p.totalHeight + PARAGRAPH_SPACING;
    } else {
      accumulatedHeightOnCurrentPage += p.totalHeight + PARAGRAPH_SPACING;
    }
  }

  return { pageCount, pageStartPositions };
}
