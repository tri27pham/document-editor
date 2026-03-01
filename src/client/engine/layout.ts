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
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { canSplit } from "@tiptap/pm/transform";

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
 * DOM position at (x, y). Uses caretPositionFromPoint with Safari fallback (caretRangeFromPoint).
 * The +1 on y in callers avoids ambiguity at the exact boundary between two lines.
 * Returns null if the browser API returns null (e.g. point outside document).
 */
function getCaretPosition(
  x: number,
  y: number
): { node: Node; offset: number } | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    return { node: pos.offsetNode, offset: pos.offset };
  }
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;
  return {
    node: range.startContainer,
    offset: range.startOffset,
  };
}

/**
 * Map splitAfterLine to ProseMirror document position for each entry with split !== null.
 * Uses caretPositionFromPoint at the top-left of the first overflow line, then view.posAtDOM.
 * Mutates entries in place by setting split.resolvedPos.
 */
export function resolveSplitPositions(
  editor: Editor,
  pageEntries: PageEntry[]
): void {
  const { view } = editor;
  for (const entry of pageEntries) {
    const { split } = entry;
    if (!split || entry.lineRects.length <= split.splitAfterLine + 1) continue;
    const overflowLineRect = entry.lineRects[split.splitAfterLine + 1];
    const caret = getCaretPosition(
      overflowLineRect.left,
      overflowLineRect.top + 1
    );
    if (caret) {
      split.resolvedPos = view.posAtDOM(caret.node, caret.offset);
    }
  }
}

const MARGIN_STACK = MARGIN_BOTTOM + PAGE_GAP + MARGIN_TOP;

/**
 * Build LayoutResult from the PageEntry list and the document. Walks doc in lockstep with entries.
 * Used after splits (with tr.doc) or when there are no splits (with editor.state.doc).
 */
export function buildLayoutResultFromEntries(
  doc: ProseMirrorNode,
  pageEntries: PageEntry[]
): LayoutResult {
  const pageStartPositions: PageStartPosition[] = [];
  let entryIndex = 0;
  doc.forEach((node, offset) => {
    const entry = pageEntries[entryIndex];
    entryIndex += 1;
    if (!entry?.decoration) return;
    pageStartPositions.push({
      proseMirrorPos: offset,
      pageNumber: pageStartPositions.length + 2,
      remainingSpace: entry.decoration.marginTop - MARGIN_STACK,
    });
  });
  return {
    pageCount: pageStartPositions.length + 1,
    pageStartPositions,
  };
}

/**
 * Apply split transactions (back-to-front by resolvedPos), set splitId on both halves,
 * then build LayoutResult from tr.doc and dispatch one transaction with layoutResult meta.
 * If no entries have split with resolvedPos, only builds and dispatches layoutResult.
 * Returns the LayoutResult for the caller to update pageCount.
 */
export function applySplitsAndDispatchLayout(
  editor: Editor,
  pageEntries: PageEntry[]
): LayoutResult {
  const { state, schema } = editor;
  const paragraphType = schema.nodes.paragraph;
  const splitEntries = pageEntries.filter(
    (e): e is PageEntry & { split: NonNullable<PageEntry["split"]> } =>
      e.split !== null && e.split.resolvedPos !== undefined
  );
  const sortedSplits = [...splitEntries].sort(
    (a, b) => (b.split.resolvedPos ?? 0) - (a.split.resolvedPos ?? 0)
  );

  let tr = state.tr;
  if (sortedSplits.length > 0) {
    for (const entry of sortedSplits) {
      const pos = entry.split.resolvedPos!;
      if (!canSplit(tr.doc, pos, 1)) continue;
      const uuid = crypto.randomUUID();
      tr.split(pos, 1, [
        { type: paragraphType, attrs: { splitId: uuid } },
      ]);
      const $pos = tr.doc.resolve(pos);
      const nodeBefore = $pos.nodeBefore;
      if (nodeBefore) {
        const startBefore = pos - nodeBefore.nodeSize;
        tr.setNodeMarkup(startBefore, undefined, {
          ...nodeBefore.attrs,
          splitId: uuid,
        });
      }
    }
  }

  const doc = tr.doc;
  const result = buildLayoutResultFromEntries(doc, pageEntries);
  editor.view.dispatch(
    tr.setMeta("layoutResult", result).setMeta("addToHistory", false)
  );
  return result;
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
