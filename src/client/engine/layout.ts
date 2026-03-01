import type { Editor } from "@tiptap/core";
import type {
  LayoutResult,
  PageStartPosition,
  PageEntry,
} from "../../shared/types";
import {
  PARAGRAPH_SPACING,
  MARGIN_TOP,
  MARGIN_BOTTOM,
  PAGE_GAP,
} from "../../shared/constants";

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

/** Sum of heights of a slice of line rects. */
function sumLineHeights(lineRects: DOMRect[], fromIndex: number, toIndex: number): number {
  let sum = 0;
  for (let i = fromIndex; i < toIndex && i < lineRects.length; i++) {
    sum += lineRects[i].height;
  }
  return sum;
}

/**
 * Pure pagination walk: build the PageEntry list from measurements. No DOM access.
 * Handles overflow by splitting at line boundaries and supports cascading splits (paragraph spanning 3+ pages).
 */
export function computePageEntries(
  measurements: ParagraphMeasurement[],
  contentHeight: number
): PageEntry[] {
  const entries: PageEntry[] = [];
  let accumulatedHeight = 0;
  const marginStack = MARGIN_BOTTOM + PAGE_GAP + MARGIN_TOP;

  for (const m of measurements) {
    const { proseMirrorPos, totalHeight, lineRects } = m;

    if (accumulatedHeight + totalHeight <= contentHeight) {
      entries.push({
        height: totalHeight,
        lineRects: [...lineRects],
        decoration: null,
        split: null,
      });
      accumulatedHeight += totalHeight + PARAGRAPH_SPACING;
      continue;
    }

    if (lineRects.length === 0) {
      // No lines to split; push whole paragraph to next page.
      entries.push({
        height: totalHeight,
        lineRects: [],
        decoration: {
          marginTop: contentHeight - accumulatedHeight + marginStack,
        },
        split: null,
      });
      accumulatedHeight = 0;
      accumulatedHeight += totalHeight + PARAGRAPH_SPACING;
      continue;
    }

    let fittingHeight = 0;
    let splitAfterLine = -1;
    for (let i = 0; i < lineRects.length; i++) {
      const h = fittingHeight + lineRects[i].height;
      if (accumulatedHeight + h <= contentHeight) {
        fittingHeight = h;
        splitAfterLine = i;
      } else {
        break;
      }
    }

    if (splitAfterLine === -1) {
      // First line doesn't fit; push whole paragraph to next page.
      entries.push({
        height: totalHeight,
        lineRects: [...lineRects],
        decoration: {
          marginTop: contentHeight - accumulatedHeight + marginStack,
        },
        split: null,
      });
      accumulatedHeight = 0;
      accumulatedHeight += totalHeight + PARAGRAPH_SPACING;
      continue;
    }

    const remainingSpace = contentHeight - accumulatedHeight - fittingHeight;
    const remainingRects = lineRects.slice(splitAfterLine + 1);
    const remainingHeight = sumLineHeights(
      lineRects,
      splitAfterLine + 1,
      lineRects.length
    );

    entries.push({
      height: fittingHeight,
      lineRects: lineRects.slice(0, splitAfterLine + 1),
      decoration: null,
      split: { splitAfterLine, sourceProseMirrorPos: proseMirrorPos },
    });
    accumulatedHeight = 0;

    let overflowHeight = remainingHeight;
    let overflowRects = remainingRects;
    let remainingSpaceForDecoration = remainingSpace;

    while (overflowHeight > contentHeight && overflowRects.length > 0) {
      let ofitHeight = 0;
      let ofitLast = -1;
      for (let i = 0; i < overflowRects.length; i++) {
        const h = ofitHeight + overflowRects[i].height;
        if (h <= contentHeight) {
          ofitHeight = h;
          ofitLast = i;
        } else {
          break;
        }
      }
      if (ofitLast === -1) {
        remainingSpaceForDecoration = contentHeight;
        entries.push({
          height: overflowRects[0].height,
          lineRects: overflowRects.slice(0, 1),
          decoration: { marginTop: contentHeight + marginStack },
          split: null,
        });
        overflowRects = overflowRects.slice(1);
        overflowHeight = sumLineHeights(overflowRects, 0, overflowRects.length);
        continue;
      }
      remainingSpaceForDecoration = contentHeight - ofitHeight;
      entries.push({
        height: ofitHeight,
        lineRects: overflowRects.slice(0, ofitLast + 1),
        decoration: null,
        split: {
          splitAfterLine: ofitLast,
          sourceProseMirrorPos: proseMirrorPos,
        },
      });
      overflowRects = overflowRects.slice(ofitLast + 1);
      overflowHeight = sumLineHeights(
        overflowRects,
        0,
        overflowRects.length
      );
    }

    entries.push({
      height: overflowHeight,
      lineRects: overflowRects,
      decoration: {
        marginTop: remainingSpaceForDecoration + marginStack,
      },
      split: null,
    });
    accumulatedHeight = overflowHeight + PARAGRAPH_SPACING;
  }

  return entries;
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
