# Implementation Plan: Materi Document Editor

**Total estimated time: 18–22 hours** (V1: 14–16h, paragraph splitting: 4–6h)

Remaining buffer for debugging, polish, and documentation: 2–6 hours of the 24h timebox.

---

## Phase 0: Project Scaffold (1–1.5h)

**Goal:** `npm install && npm run dev` starts both frontend and backend with hot reload. Nothing else.

- [ ] Init monorepo with single `package.json`. Vite for frontend, `tsx` or `ts-node` for backend dev server.
- [ ] Directory structure:
  ```
  src/
    client/          # React app
      main.tsx
      App.tsx
    server/
      index.ts       # Express entry
    shared/
      types.ts       # EditorDocument model types, LayoutResult
      constants.ts   # Layout constants (single source of truth)
  docs/
    PRD.md
    ARCHITECTURE.md
    AI_USAGE.md
  ```
- [ ] Configure TypeScript with strict mode. Single `tsconfig.json` with path aliases for shared code.
- [ ] Add `concurrently` to run frontend + backend from one command.
- [ ] Verify: `npm run dev` opens browser, shows blank React app, Express responds on its port.

**Why first:** Everything depends on the scaffold. Getting this wrong means fighting tooling for the rest of the build. Resolve all import/build issues now when there's no code to break.

---

## Phase 1: Layout Constants + Document Model Types (0.5h)

**Goal:** The shared types and constants that everything else references.

- [ ] `shared/constants.ts` — all layout constants from the PRD (PAGE_WIDTH, PAGE_HEIGHT, margins, CONTENT_HEIGHT, PAGE_GAP).
- [ ] `shared/types.ts`:
  - `EditorDocument`, `Paragraph`, `Run` — document model types. Named `EditorDocument` to avoid shadowing the global DOM `Document` interface.
  - `LayoutResult` interface:
    ```typescript
    interface LayoutResult {
      pageCount: number
      pageStartPositions: {
        proseMirrorPos: number  // where to apply the decoration
        pageNumber: number      // which page this starts (2, 3, 4...)
        remainingSpace: number  // gap from last paragraph bottom to previous page's content boundary
      }[]
    }
    ```

**Why now:** These are dependencies for both the editor and the layout engine. Define them once before any implementation code.

---

## Phase 2: Basic TipTap Editor (1.5–2h)

**Goal:** A working TipTap editor in the page with a content area styled to A4 width. No pagination yet.

- [ ] Install TipTap core, starter-kit, and React integration.
- [ ] Mount editor in a React component with a fixed-width container (PAGE_WIDTH minus left/right margins = content width of 602px).
- [ ] Basic editor styling — white background, reasonable font, content area centred on screen with grey surround.
- [ ] Verify: can type text, cursor works, basic editing operations function.

**Why now:** The editor is the foundation everything builds on. Confirming TipTap works in your scaffold before adding complexity.

---

## Phase 3: Layout Engine (2–2.5h)

**Goal:** Measure paragraph heights from the TipTap DOM and determine which paragraphs land on which pages. Produce a `LayoutResult`.

- [ ] Write a measurement function that walks `editor.state.doc.forEach((node, offset) => ...)` in lockstep with the corresponding DOM elements, collecting both `getBoundingClientRect().height` and the ProseMirror `offset` position for each paragraph. The `offset` value from `doc.forEach` is the ProseMirror position needed later for `Decoration.node()`.
- [ ] Write the pagination algorithm: walk paragraphs, accumulate heights against CONTENT_HEIGHT, determine page assignments. When a paragraph doesn't fit on the current page, the entire paragraph moves to the next page (whole-paragraph pushing in V1). Log straddling paragraphs (those exceeding remaining page space) to console as candidates for future mid-paragraph splitting.
- [ ] Produce a `LayoutResult`:
  - `pageCount`: total number of pages.
  - `pageStartPositions`: array of `{ proseMirrorPos, pageNumber, remainingSpace }` for each page after the first — these are the paragraphs that start a new page and will receive decorations. `remainingSpace` is `CONTENT_HEIGHT - accumulatedHeightOnCurrentPage` at the point the page break is triggered, captured naturally during the pagination walk.
- [ ] Wire it into the editor: trigger on editor `update` event with a 100–150ms debounce. The debounce exists for batching rapid edits, not for performance — a full layout pass on 50 paragraphs is 2–5ms total JS time.
- [ ] Console.log the `LayoutResult` to verify correctness — type enough text to overflow one page and confirm the break point is correct.

**Why now:** This is the core algorithm. Get it right in isolation before adding any visual output.

**Note on measurement stability:** `getBoundingClientRect().height` does **not** include margin, so decoration margins from Phase 4 will not affect paragraph height measurements. There is no need to clear decorations before measuring. The layout cycle is stable:
1. TipTap updates from the edit
2. Measure all paragraph heights (decorations don't affect measurements)
3. Run pagination algorithm → new `LayoutResult`
4. Apply new decorations

---

## Phase 4: Visual Decorations — Page Gaps (1.5–2h)

**Goal:** The first paragraph on each new page gets a `margin-top` decoration that creates the visual gap between pages.

- [ ] Implement a TipTap plugin that holds the current `LayoutResult` in its plugin state.
- [ ] New `LayoutResult` values are dispatched into the plugin via `tr.setMeta('layoutResult', newLayoutResult)`.
- [ ] The plugin's `decorations` method reads its state and maps each entry in `pageStartPositions` to a `Decoration.node()` call targeting the paragraph at `proseMirrorPos`, applying a `style` attribute with the appropriate `margin-top` value.
- [ ] The margin value = `entry.remainingSpace + MARGIN_BOTTOM + PAGE_GAP + MARGIN_TOP`, where `entry.remainingSpace` is read directly from the corresponding `pageStartPositions` entry. This accounts for: the leftover space at the bottom of the previous page, the bottom margin of the ending page, the visible gap between pages, and the top margin of the new page.
- [ ] Decorations are visual-only — they never enter the document model, don't affect `getJSON()`, and don't interact with undo/redo.
- [ ] Verify: type enough text to create 2+ pages. A visible gap appears between pages. Content below the gap is correctly positioned. Typing above the gap causes content to reflow smoothly.

---

## Phase 5: Visual Overlays — Page Frames + Numbers (1.5–2h)

**Goal:** A4 page outlines and "Page X of N" labels visible in the editor.

- [ ] Create an overlay container as a sibling div to the TipTap editor, same dimensions, absolutely positioned over it, `pointer-events: none`.
- [ ] For each page, derive the frame position from accumulated paragraph heights and decoration gap margins — do not rely on `textStartY` (which is reserved for future per-page instance use).
  - Page 1 frame starts at y=0.
  - Subsequent page frames start at the cumulative content height plus all preceding gap margins.
- [ ] For each page frame, render:
  - A4 frame outline (border or box-shadow) at the correct y-position.
  - Page number label (e.g. bottom-centre of each page frame), using `pageCount` from `LayoutResult`.
- [ ] Verify: visual page frames align with content. Page numbers update live as content reflows. Frames don't interfere with clicking/selecting text.

**Milestone check:** At this point, AC-1 and AC-2 should pass. Type text → see page boundaries and numbers → create 3+ pages.

---

## Phase 6: Backend API (1–1.5h)

**Goal:** Express server with two endpoints and in-memory storage.

- [ ] `POST /documents` — accepts `{ title, content }`, generates UUID, sets `created_at` and `updated_at`, stores in a `Map<string, EditorDocument>`, returns `{ id }`.
- [ ] `GET /documents/:id` — returns full document JSON or 404.
- [ ] CORS enabled for local dev.
- [ ] Verify with curl or Postman: POST a document, GET it back, confirm round-trip.

**Why now and not earlier:** The backend is simple and decoupled. Building it after the editor works means you can test with real editor output immediately.

---

## Phase 7: Serialisation + Save/Load UI (2–2.5h)

**Goal:** Save and load documents through the UI with clean round-trip fidelity.

- [ ] **Serialiser:** Convert `editor.getJSON()` → your `EditorDocument` model format. TipTap paragraph nodes → `Paragraph`, text nodes with marks → `Run`. Decorations are not in `getJSON()` so no stripping needed.
- [ ] **Deserialiser:** Your `EditorDocument` model → TipTap node format, passed to `editor.commands.setContent()`.
- [ ] **Save button:** Serialise current editor state, POST to backend, display returned ID to user.
- [ ] **Load input:** Text field for document ID, fetches from backend, deserialises into editor, triggers layout recalculation.
- [ ] Gate the post-load layout pass on `document.fonts.ready` to ensure deterministic pagination.
- [ ] **Verify the critical path:** Type content across 3+ pages → Save → note the ID → hard refresh the browser → Load by ID → content structure and pagination match.

**This is the most important phase to test thoroughly.** AC-3 is a hard acceptance criterion tested during the live review. Any lossy transformation in the round-trip (whitespace, paragraph order, run boundaries) will be visible.

---

## Phase 8: Polish + Edge Cases (1–1.5h)

**Goal:** Harden the demo for the live review.

- [ ] Test save/load multiple times with varying content lengths. Confirm no drift.
- [ ] Check for console errors during typical usage (AC-4). Fix any warnings from React strict mode or TipTap.
- [ ] Handle empty document state gracefully (no pages = still show one blank page frame).
- [ ] Handle rapid typing near page boundaries — confirm debounce prevents visual flickering.
- [ ] Test with long paragraphs approaching full page height. Confirm they push cleanly. Log straddling paragraphs to console as expected.
- [ ] Basic UI polish: save confirmation feedback, load error handling, reasonable visual styling.

---

## Phase 9: Documentation (1–1.5h)

**Goal:** All required deliverables.

- [ ] **`README.md`**: Prereqs, setup, run commands, API endpoints with curl examples, data model description, pagination strategy summary.
- [ ] **`ARCHITECTURE.md` (≤2 pages)**: Editor state model, pagination algorithm (measurement + pagination → LayoutResult → decorations → overlays), persistence flow. Keep it tight — brief approach rationale, focus on the edit cycle and layout engine, minimal persistence section.
- [ ] **`AI_USAGE.md`**: Tools used, tasks, prompts.
- [ ] **Chat logs** exported to `.md`.

**Why last:** Documentation describes what you built, not what you planned. Writing it after implementation ensures accuracy.

---

## V1 Complete — Checkpoint

At this point all four acceptance criteria should pass. **Do not proceed to paragraph splitting until you've verified this by running through the exact acceptance test sequence:**

1. Start app locally → open editor → type text → see page boundaries and numbers. ✓
2. Add enough content to create ≥3 pages. ✓
3. Save → receive ID → refresh → Load by ID → identical content and pagination. ✓
4. No runtime console errors. ✓

---

## Phase 10: Mid-Paragraph Splitting (4–6h)

**Prerequisite:** V1 is stable and all acceptance criteria pass.

### 10a: Line-to-Offset Mapping (1–1.5h)

- [ ] For straddling paragraphs identified during the layout pass (those that don't fit on the current page but are too large to simply push), map the break line's y-coordinate to a text offset within the paragraph.
- [ ] Use `getClientRects()` on the paragraph's text node to identify individual line y-coordinates, find the line at the page boundary.
- [ ] Then use `document.caretPositionFromPoint()` (or `caretRangeFromPoint` for WebKit) at the break y-coordinate to get a DOM position, then map to a ProseMirror offset using `editor.view.posAtCoords()`.
- [ ] Verify: log the offset for a known paragraph and confirm it corresponds to the correct character position.

### 10b: Split Transaction (1–1.5h)

- [ ] Execute a TipTap/ProseMirror transaction that splits the boundary paragraph at the computed offset.
- [ ] Use `addToHistory: false` on the transaction to keep undo history clean — users should not undo layout-triggered splits.
- [ ] Add a custom attribute `continuedFrom: paragraphId` to the second half of the split paragraph to track the relationship.
- [ ] The second half receives the `margin-top` decoration — same mechanism as V1's whole-paragraph pushing.
- [ ] Verify: type a long paragraph that crosses a page boundary. It splits visually at the correct line. Cursor behaviour is correct on both halves.

### 10c: Merge on Reflow (1–1.5h)

- [ ] At the start of each layout pass (before measurement), scan for `continuedFrom` paragraph pairs where the split is no longer needed (both halves now fit on the same page).
- [ ] Merge them back into a single paragraph via a TipTap transaction (`addToHistory: false`).
- [ ] Handle cascading splits: a paragraph spanning 3+ pages produces multiple splits. The layout pass runs iteratively until no paragraph overflows. This converges because splits only make paragraphs shorter.
- [ ] Verify: type a long paragraph across a page boundary (splits). Delete content above it so it fits on one page (merges back). Undo/redo still works correctly from the user's perspective.

### 10d: Serialisation Merge (0.5–1h)

- [ ] On save, walk the document tree and detect `continuedFrom` pairs. Merge them back into single paragraphs before serialising to the `EditorDocument` model.
- [ ] The persisted document never contains artificial splits.
- [ ] On load, the layout engine computes fresh splits from the flat document model.
- [ ] Verify the round-trip: save a document with split paragraphs → load → paragraphs are merged in the persisted model → layout engine re-splits them correctly → identical visual result.

### 10e: Edge Cases (0.5h)

- [ ] Paragraph that spans 3 pages (two splits of the same original).
- [ ] Split paragraph where the user then edits text in the first half, causing the split point to shift.
- [ ] Cursor positioned at the split point during a reflow — confirm it doesn't jump unexpectedly.

---

## Dependency Graph

```
Phase 0 (scaffold)
  └── Phase 1 (types + constants)
        ├── Phase 2 (TipTap editor)
        │     └── Phase 3 (layout engine)
        │           └── Phase 4 (decorations)
        │                 └── Phase 5 (overlays)
        │                       └── Phase 8 (polish)
        └── Phase 6 (backend)
              └── Phase 7 (serialisation + UI)
                    └── Phase 8 (polish)
                          └── Phase 9 (docs)
                                └── ✓ V1 CHECKPOINT
                                      └── Phase 10 (splitting)
```

Phases 6 and 2–5 can run in parallel if needed, but sequencing as listed above means each phase builds on a tested foundation.