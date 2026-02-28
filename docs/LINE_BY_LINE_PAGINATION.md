# Line-by-Line Pagination — Implementation Plan

**Prerequisite:** V1 is stable and all acceptance criteria pass. This extends existing functionality — primarily new code with minimal changes to V1.

**Estimated time: 4–6h**

---

## Overview

V1 pushes whole paragraphs to the next page when they don't fit. This extension splits paragraphs at the exact line where they overflow a page boundary, and merges them back when content reflows and the split is no longer needed.

The approach uses real ProseMirror transactions to split and merge paragraph nodes, rather than decoration-only tricks. This gives proper cursor behaviour, selection, and copy/paste across visual page breaks.

---

## Key Concepts

### Split vs Push Decision

- Paragraph fits entirely on the current page → no action (existing V1).
- Paragraph doesn't fit on the current page but fits on the next page → push whole paragraph (existing V1).
- Paragraph partially fits on the current page and is too tall to just push → **split at the line boundary**.
- Paragraph taller than `CONTENT_HEIGHT` (spans multiple pages) → **cascading splits** across multiple boundaries.

### Split Pair Tracking

Both halves of a split paragraph share a `splitId` attribute (a generated UUID). Document order determines which is the first half and which is the continuation. No unique IDs needed on every paragraph — only split pairs carry the marker.

Requires extending the TipTap paragraph node spec with an optional `splitId` attribute.

### Revised Layout Cycle

1. Editor update fires → debounced layout pass starts.
2. **Merge pass:** scan for `splitId` pairs that are adjacent — merge them unconditionally via transaction (`addToHistory: false`). If the merged paragraph still overflows, the split step below will re-split it. This avoids speculative measurement.
3. Measure all paragraph heights.
4. Run pagination: walk paragraphs, accumulate heights against `CONTENT_HEIGHT`.
5. When a paragraph straddles a page boundary → compute the line-level split point → execute split transaction (`addToHistory: false`, set `splitId` on both halves).
6. Re-measure (the split changed the DOM).
7. Run pagination again on the now-split paragraphs → produce `LayoutResult`.
8. Apply decorations.

Steps 5–7 may iterate if a split paragraph still straddles (spans 3+ pages). Converges because each split reduces paragraph size.

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

## Phase 10b: Line-Level Split Point Detection (1–1.5h)

**Goal:** Given a paragraph element and the remaining space on the current page, find the exact ProseMirror position where the paragraph should split.

- [ ] For a straddling paragraph, determine how much vertical space remains on the current page (`remainingSpaceOnPage`).
- [ ] Use `Range.getClientRects()` to get one rect per visual line of the paragraph:
  ```typescript
  const range = document.createRange()
  range.selectNodeContents(paragraphElement)
  const lineRects = range.getClientRects()
  ```
  This works uniformly regardless of inline formatting (bold, italic, links, mixed font sizes). Each rect's height reflects the actual rendered line height including the tallest inline element on that line.
- [ ] Walk the line rects, accumulating heights. Find the last line whose cumulative height fits within `remainingSpaceOnPage`. The next line is where the split happens.
- [ ] Use `caretPositionFromPoint` at the top-left of the overflow line to get the DOM text position:
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

  const splitCaret = getCaretPosition(contentAreaLeft, overflowLineRect.top + 1)
  ```
  The `+ 1` on y avoids ambiguity at the exact boundary between two lines.
- [ ] Map the DOM position to a ProseMirror position via `view.posAtDOM(splitCaret.node, splitCaret.offset)`.
- [ ] Verify: log the split position for a known paragraph and confirm it corresponds to the correct character at the start of the overflow line.

---

## Phase 10c: Split Transaction (1–1.5h)

**Goal:** Execute the split in the document model and track the pair.

- [ ] Generate a UUID for the `splitId`.
- [ ] Execute a ProseMirror transaction that splits the paragraph at the computed position:
  - Use `tr.split(splitPos)` to create two paragraph nodes.
  - Set `splitId` on both halves via `tr.setNodeMarkup()`.
  - Use `addToHistory: false` — layout-triggered splits must not appear in the user's undo stack.
- [ ] The second half of the split receives the `margin-top` decoration through the existing decoration plugin — it becomes the first paragraph on the new page, same as V1's whole-paragraph pushing. No changes to the decoration plugin needed.
- [ ] Handle cascading splits: after splitting, re-measure and re-paginate. If the second half still overflows (paragraph spans 3+ pages), split again. Each iteration generates a new `splitId` shared between the new pair. Loop until no paragraph overflows.
- [ ] Verify: type a long paragraph that crosses a page boundary. It splits visually at the correct line. Cursor and selection work on both halves. Typing in either half triggers reflow.

---

## Phase 10d: Merge on Reflow (1h)

**Goal:** When content is deleted and a split is no longer needed, merge the pair back.

- [ ] At the start of each layout pass (step 2 of the revised layout cycle), scan the document for adjacent paragraphs sharing a `splitId`.
- [ ] Merge them unconditionally via a ProseMirror transaction:
  - Join the two paragraph nodes back into one.
  - Remove the `splitId` attribute from the merged paragraph.
  - Use `addToHistory: false`.
- [ ] Handle chains: a paragraph split across 3 pages has pairs A↔B and B↔C (different `splitId` values). Merge greedily — merge all adjacent `splitId` pairs in a single pass. Order matters: merge from the end of the document backward to avoid position shifts invalidating later merges.
- [ ] After merging, the normal layout pass re-measures and re-splits if the merged paragraph still overflows. This avoids any speculative "will it fit?" checks.
- [ ] Verify: type a long paragraph across a page boundary (splits). Delete content above it so it fits on one page (merges back). Undo/redo still works correctly from the user's perspective.

---

## Phase 10e: Edge Cases (0.5h)

- [ ] Paragraph spanning 3+ pages (two cascading splits).
- [ ] User edits text in the first half of a split, causing the split point to shift — confirm reflow handles this (merge → re-split at new point).
- [ ] Cursor positioned at the split point during a reflow — confirm it doesn't jump unexpectedly.
- [ ] Empty second half after split (edge case: split lands exactly at end of paragraph) — handle gracefully or prevent.
- [ ] Paragraph with mixed inline formatting split mid-format (e.g. split inside a bold run) — confirm marks are preserved on both halves.

---

## Changes to Existing V1 Code

Intentionally minimal:

| Area | Change |
|------|--------|
| **Paragraph node spec** | Add optional `splitId` attribute |
| **Layout engine** | After identifying a straddling paragraph, call new split logic instead of pushing. Core pagination algorithm unchanged. |
| **Decoration plugin** | No change — still reads `pageStartPositions`, applies `margin-top` |
| **Overlay renderer** | No change — still derives positions from `pageCount` and heights |

---

## Merge on Save (Persistence)

When saving, walk the document and merge all adjacent `splitId` pairs before sending `content` to the API. The persisted document never contains artificial splits. On load, `setContent(doc.content)` loads the merged document; the layout engine re-splits when needed.

See **Phase 10d** for merge logic; reuse the same merge transaction logic before POSTing.
