# Line-by-Line Pagination — Implementation Plan

**Prerequisite:** V1 is stable and all acceptance criteria pass. This extends existing functionality — primarily new code with minimal changes to V1.

**Estimated time: 4–6h**

---

## Overview

V1 pushes whole paragraphs to the next page when they don't fit. This extension splits paragraphs at the exact line where they overflow a page boundary, and merges them back when content reflows and the split is no longer needed.

The approach uses real ProseMirror transactions to split and merge paragraph nodes, rather than decoration-only tricks. This gives proper cursor behaviour, selection, and copy/paste across visual page breaks.

---

## Key Concepts

### Layout Algorithm: Append First, Change Later

The pagination walk treats this as an interval problem. We build a flat list of `PageEntry` items by walking the document top-to-bottom:

1. Append the next paragraph to the list with its height and line rects.
2. Does it fit on the current page? → Move on to the next paragraph.
3. Does it overflow? →
   - Walk its `lineRects` to find which lines fit on the current page.
   - Mark this entry with `split` and reduce its height to the fitting lines.
   - Create a new entry for the overflow lines — append it with a `decoration` (margin-top) and the height of the remaining lines.
   - Evaluate the new entry against the next page's `CONTENT_HEIGHT`. If it still overflows, repeat (cascading split).
4. Continue with the next paragraph.

By the end of the walk, the list is the complete page layout. Entries with `split !== null` need transactions. Entries with `decoration !== null` need margin decorations. No second pagination pass needed.

### PageEntry Interface

```typescript
interface PageEntry {
  height: number              // total height of this entry
  lineRects: DOMRect[]        // collected during initial DOM read
  decoration: {
    marginTop: number         // gap value for page starters (remainingSpace + margins + gap)
  } | null
  split: {
    splitAfterLine: number    // lines 0..N stay on current page, rest overflow
    sourceProseMirrorPos: number  // from ParagraphMeasurement, used only for the split transaction
  } | null
}
```

`proseMirrorPos` is not stored on `PageEntry` — split positions come from `ParagraphMeasurement` and live on `split.sourceProseMirrorPos`, while decoration positions are collected in the final `doc.forEach` walk after splits execute. `pageNumber` is not stored — it's implicit from list order. Every entry with `decoration !== null` starts a new page, so page number is a running count. `pageCount` is derived as the count of decoration entries + 1.

### No Layout Thrashing

All DOM measurement happens in a single read pass before the pagination walk. `Range.getClientRects()` gives per-line heights for every paragraph upfront. The pagination walk is pure computation over this data — no DOM reads, no intermediate splits requiring re-measurement. Line heights don't change when you split a paragraph, so the initial measurements remain valid.

The sequence:
1. **Merge pass** — scan for `splitId` pairs from the previous layout cycle, merge them unconditionally (`addToHistory: false`). Merging must happen before measurement so the DOM read operates on the clean, unsplit document.
2. **Single DOM read** — for each paragraph, collect `getBoundingClientRect().height` and `Range.getClientRects()` (per-line rects) via `doc.forEach`. ProseMirror positions are stored in `ParagraphMeasurement` for split transactions only. If no merges occurred in step 1, this can reuse measurements taken before the merge pass.
3. **Pure computation** — pagination walk builds the `PageEntry` list. No DOM access.
4. **Split point resolution** — `caretPositionFromPoint` maps `splitAfterLine` to character offsets for each split entry.
5. **Split transactions** — filter entries where `split !== null`, execute back-to-front (highest `split.sourceProseMirrorPos` first) so earlier positions remain valid. Single batched transaction, `addToHistory: false`, set `splitId` on both halves.
6. **Position collection** — `doc.forEach` walk on the now-split document, zipped in lockstep with the `PageEntry` list (same count, same order). For each entry with `decoration !== null`, record its real `proseMirrorPos`. Sub-millisecond, no DOM reads.
7. **Build `LayoutResult`** — decoration entries become `pageStartPositions` with their collected positions. `pageCount` = count of decoration entries + 1.
8. **Apply decorations.**

### Split Pair Tracking

Both halves of a split paragraph share a `splitId` attribute (a generated UUID). Document order determines which is the first half and which is the continuation. No unique IDs needed on every paragraph — only split pairs carry the marker.

Requires extending the TipTap paragraph node spec with an optional `splitId` attribute.

### Revised Layout Cycle

1. Editor update fires → debounced layout pass starts.
2. **Merge pass** — merge any existing `splitId` pairs from previous cycle (`addToHistory: false`).
3. **Single DOM read** — paragraph heights, line rects, ProseMirror positions (stored in `ParagraphMeasurement`). If no merges occurred in step 2, this can reuse measurements taken before the merge pass.
4. **Pagination walk** — pure computation, builds `PageEntry` list.
5. **Split transactions** — execute back-to-front using `split.sourceProseMirrorPos` (`addToHistory: false`).
6. **`doc.forEach` walk** — zip with `PageEntry` list to collect real `proseMirrorPos` for decoration entries.
7. **Build `LayoutResult`** (`pageCount` = decoration entries + 1) and apply decorations.

---

## Phase 10a: Paragraph Node Spec Extension (0.5h)

- [ ] Extend the TipTap paragraph node with an optional `splitId` attribute:
  ```typescript
  addAttributes() {
    return {
      splitId: { default: null, rendered: false }
    }
  }
  ```
- [ ] `rendered: false` keeps it out of the DOM — it's internal metadata only.
- [ ] Verify: existing paragraphs unaffected, `getJSON()` includes `splitId: null` or omits it.

---

## Phase 10b: DOM Measurement Pass (1h)

**Goal:** Collect all data needed for pagination in a single DOM read.

- [ ] For each paragraph, walk `editor.state.doc.forEach((node, offset) => ...)` in lockstep with corresponding DOM elements.
- [ ] For each paragraph element, collect:
  - `getBoundingClientRect().height` — total paragraph height.
  - `Range.getClientRects()` — per-line rects:
    ```typescript
    const range = document.createRange()
    range.selectNodeContents(paragraphElement)
    const lineRects = Array.from(range.getClientRects())
    ```
    Works uniformly regardless of inline formatting (bold, italic, links, mixed font sizes). Each rect's height reflects the actual rendered line height including the tallest inline element on that line.
  - ProseMirror `offset` from `doc.forEach` — stored in `ParagraphMeasurement` for use as `split.sourceProseMirrorPos` during split transactions. Not carried forward to `PageEntry`.
- [ ] Store as an array of measurement data:
  ```typescript
  interface ParagraphMeasurement {
    proseMirrorPos: number
    totalHeight: number
    lineRects: DOMRect[]
  }
  ```
- [ ] Verify: log measurements for a document with mixed content (headings, body text, long paragraphs). Confirm line rect counts match visible line counts.

---

## Phase 10c: Pagination Walk (1–1.5h)

**Goal:** Pure computation — build the `PageEntry` list from measurements. No DOM access.

- [ ] Walk the `ParagraphMeasurement` array. Maintain `accumulatedHeight` counter.
- [ ] For each paragraph:
  - Append a `PageEntry` with its full height and line rects.
  - If `accumulatedHeight + totalHeight <= CONTENT_HEIGHT` → fits. Accumulate and move on.
  - If it overflows:
    - Walk `lineRects`, accumulating line heights to find the last line that fits (`splitAfterLine`).
    - Mark the entry: `split = { splitAfterLine, sourceProseMirrorPos: measurement.proseMirrorPos }`, reduce `height` to the sum of fitting line heights.
    - Compute `remainingSpace = CONTENT_HEIGHT - accumulatedHeight - fittingLinesHeight`.
    - Create a new `PageEntry` for the overflow lines:
      - `height` = sum of remaining line rects.
      - `lineRects` = the remaining rects.
      - `decoration = { marginTop: remainingSpace + MARGIN_BOTTOM + PAGE_GAP_VISUAL + MARGIN_TOP }`.
    - Append the overflow entry and evaluate it against the next page's `CONTENT_HEIGHT`. If it still overflows, repeat (cascading split — same logic, next page).
  - Reset `accumulatedHeight` when starting a new page.
- [ ] By the end, the list is the complete layout. `pageCount` = count of entries with `decoration !== null` + 1.
- [ ] Verify: log the `PageEntry` list for a document with paragraphs crossing page boundaries. Confirm split points and page assignments are correct.

---

## Phase 10d: Split Point to Character Offset (0.5h)

**Goal:** Map `splitAfterLine` to a ProseMirror character position for the split transaction.

- [ ] For each entry where `split !== null`, use `caretPositionFromPoint` at the top-left of the first overflow line to get the DOM text position:
  ```typescript
  function getCaretPosition(x: number, y: number) {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y)
      return { node: pos.offsetNode, offset: pos.offset }
    }
    // Safari fallback
    const range = document.caretRangeFromPoint(x, y)
    return { node: range.startContainer, offset: range.startOffset }
  }

  const overflowLineRect = entry.lineRects[entry.split.splitAfterLine + 1]
  const splitCaret = getCaretPosition(contentAreaLeft, overflowLineRect.top + 1)
  ```
  The `+ 1` on y avoids ambiguity at the exact boundary between two lines.
- [ ] Map to ProseMirror position via `view.posAtDOM(splitCaret.node, splitCaret.offset)`.
- [ ] Store the resolved position on the entry for the transaction step.
- [ ] Verify: log the character offset for known paragraphs and confirm it corresponds to the start of the overflow line.

---

## Phase 10e: Split Transactions (1h)

**Goal:** Execute all splits in a single pass, then collect final positions.

- [ ] Filter `PageEntry` list for entries where `split !== null`.
- [ ] Sort by `split.sourceProseMirrorPos` descending (back-to-front). Splitting a later paragraph doesn't affect positions of earlier paragraphs, so back-to-front execution keeps all positions valid.
- [ ] Execute a single batched ProseMirror transaction:
  - For each split entry: `tr.split(resolvedSplitPos)`.
  - Set `splitId` (generated UUID) on both halves via `tr.setNodeMarkup()`.
  - `addToHistory: false` — layout-triggered splits must not appear in the user's undo stack.
- [ ] After the transaction, do a `doc.forEach` walk on the updated document, zipped in lockstep with the `PageEntry` list (same count, same order). For each entry with `decoration !== null`, record its real `proseMirrorPos`.
- [ ] Build `LayoutResult` from the decoration entries:
  ```typescript
  interface LayoutResult {
    pageCount: number           // decoration entries + 1
    pageStartPositions: {
      proseMirrorPos: number    // collected from post-split doc.forEach walk
      remainingSpace: number    // from PageEntry.decoration.marginTop calculation
    }[]
  }
  ```
  `pageNumber` is not stored — it's implicit from array index (`pageStartPositions[0]` = page 2, `[1]` = page 3, etc.).
- [ ] Apply decorations via the existing decoration plugin. No changes to the plugin needed — it still reads `pageStartPositions` and applies `margin-top`.
- [ ] Verify: type a long paragraph crossing a page boundary. It splits at the correct line. Cursor and selection work on both halves. Typing triggers reflow.

---

## Phase 10f: Merge on Reflow (1h)

**Goal:** When content is deleted and a split is no longer needed, merge the pair back.

- [ ] At the start of each layout pass (before DOM measurement), scan the document for adjacent paragraphs sharing a `splitId`.
- [ ] Merge them unconditionally via a ProseMirror transaction:
  - Join the two paragraph nodes back into one.
  - Remove the `splitId` attribute from the merged paragraph.
  - `addToHistory: false`.
- [ ] Handle chains: a paragraph split across 3 pages has pairs A↔B and B↔C (different `splitId` values). Merge greedily — merge all adjacent `splitId` pairs in a single pass. Merge from the end of the document backward to avoid position shifts invalidating later merges.
- [ ] After merging, the DOM has changed — the measurement pass that follows will read the merged paragraphs. The pagination walk then re-splits if the merged paragraph still overflows. No speculative "will it fit?" checks needed.
- [ ] If no merges occurred, skip the post-merge re-read and use the initial DOM measurements directly.
- [ ] Verify: type a long paragraph across a page boundary (splits). Delete content above it so it fits on one page (merges back). Undo/redo still works correctly from the user's perspective.

---

## Phase 10g: Edge Cases (0.5h)

- [ ] Paragraph spanning 3+ pages (two cascading splits).
- [ ] User edits text in the first half of a split, causing the split point to shift — confirm reflow handles this (merge → re-measure → re-split at new point).
- [ ] Cursor positioned at the split point during a reflow — confirm it doesn't jump unexpectedly.
- [ ] Empty second half after split (edge case: split lands exactly at end of paragraph) — handle gracefully or prevent.
- [ ] Paragraph with mixed inline formatting split mid-format (e.g. split inside a bold run) — confirm marks are preserved on both halves.

---

## Changes to Existing V1 Code

Intentionally minimal:

| Area | Change |
|------|--------|
| **Paragraph node spec** | Add optional `splitId` attribute |
| **Layout engine** | Replace whole-paragraph pushing with the `PageEntry` pagination walk for straddling paragraphs. Non-straddling paragraphs behave identically to V1. |
| **DOM measurement** | Extended to collect `Range.getClientRects()` per paragraph in addition to `getBoundingClientRect().height` |
| **Decoration plugin** | No change — still reads `pageStartPositions`, applies `margin-top` |
| **Overlay renderer** | No change — still derives positions from `pageCount` and heights |