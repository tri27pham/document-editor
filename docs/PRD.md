# PRD: Materi Document Editor — Live Pagination Prototype

## 1. Overview

Build a minimal, working browser-based document editor with visible live pagination, coupled to a simple persistence layer. This is a founding engineer case study for Materi's unified editor/runtime platform.

> *"In a document editor, the hardest constraint is editing-time pagination: a fixed page rectangle that must flow, break, and reflow deterministically while the user types. Print CSS paginates only at print time and does not address live editing or deterministic reloads. This task isolates that problem."* — Spec

**Timebox:** 24 hours from receipt.

**Stack:** React + TipTap frontend, Express backend. Single language across the stack.

---

## 2. Goals

### Primary Goals
- Demonstrate a clean, understandable layout engine that paginates content in real time during editing.
- Prove save/load fidelity: the document model is the source of truth, not an incidental DOM snapshot.
- Show clear separation between editor state, pagination/layout logic, rendering, and persistence.

### What This Demonstrates to Materi
- Pagination correctness under live edits de-risks downstream features (comments, headers/footers, export, cross-refs).
- Save/load fidelity proves the state model is authoritative and portable across surfaces.
- Architectural clarity and defensible tradeoffs under time pressure.

### Success Criteria (from spec)
> *"Your choices should prioritise determinism, clarity, and testability over breadth of features."*

---

## 3. Scope

### In Scope
- Single-user, local demo of a paginated document editor.
- A4 portrait pages visible during editing with live page numbers.
- Content reflow across pages on edit without visual glitches.
- Save and load via backend API with JSON persistence.
- Plain text editing (no formatting required).

### Out of Scope (per spec)
- Real-time collaboration, multi-user presence, auth.
- Text formatting (bold, italic, bullet points, text size) — not required, may add if time permits.
- Non-text elements (tables, images, charts).
- Track changes, comments, spellcheck, printing/export to PDF/DOCX.
- Mobile layout, cross-browser perfection.

---

## 4. Architecture

### Approach: TipTap DOM with Visual Decorations

TipTap is the single visible editing surface. The layout engine reads from TipTap's rendered DOM and outputs visual decorations (TipTap Decoration API + absolutely positioned overlays). No content injection into the document tree.

**Why this approach:**
- TipTap's native editing behaviour (cursor, selection, caret, keyboard navigation) works without modification.
- No parallel DOMs, no coordinate translation, no cursor mapping.
- Decorations are visual-only — they don't exist in `getJSON()`, don't affect undo/redo, and don't interact with editing operations.
- Persistence is trivial: save sends `editor.getJSON()` as `content`; load calls `editor.commands.setContent(doc.content)`. No custom serialisation layer.

**Key tradeoff:** The DOM approach requires two-pass measurement (browser renders first, then we read positions), making pagination reactive rather than predictive. This is the fundamental cost of delegating line-breaking to the browser.

### Document Model

The persisted document uses TipTap/ProseMirror JSON: `content` is `JSONContent` (the output of `editor.getJSON()`). The backend stores `{ id, title, content, created_at, updated_at }` as-is. No separate paragraph/run schema or custom serialisation; the editor state is the source of truth.

### Layout Engine (Pure Function)

**Pass 1 — Paragraph Heights:**
Batch read `getBoundingClientRect().height` on all TipTap paragraph nodes from the dirty point onwards. Identify which paragraphs cross a page boundary. All reads happen in a single batch to avoid layout thrashing.

**Pass 2 — Line-Level Measurement:**
Only runs on boundary paragraphs identified in Pass 1. Uses `getClientRects()` to get individual line positions. Identifies the exact y-coordinate where the page break falls.

**Pagination Algorithm:**
Walks paragraphs accumulating height. When accumulated height crosses a page boundary, records a break. Output:

```typescript
type LayoutResult = {
  pageBreaks: number[]   // y-offsets where page boundaries sit
  textStartY: number[]   // where content begins on each new page
  pageCount: number
}
```

### Visual Rendering

**Page gaps:** `margin-top` applied via TipTap Decoration API to the first paragraph on each new page. The margin value equals `MARGIN_BOTTOM + page_gap + MARGIN_TOP`. Decorations are visual-only and don't affect the document model.

**Page frames and numbers:** Absolutely positioned overlays (A4 frame outlines, page number labels) rendered in a sibling div outside TipTap's content flow. Zero height impact on measurements.

### Page Break Behaviour (V1)
Paragraph-level pushing: if a paragraph doesn't fit on the current page, the entire paragraph moves to the next page. Mid-paragraph splits are not implemented in V1 (see §8 Future Extensions).

### Edit Cycle

```
User types
  → TipTap updates DOM immediately (cursor stays responsive)
  → Debounce 100–150ms
  → Pass 1: batch read paragraph heights
  → Pass 2: line-level measurement on boundary paragraphs
  → Pagination algorithm produces LayoutResult
  → Decoration update + overlay repositioning
```

### Layout Constants (single file)

| Constant | Value |
|----------|-------|
| PAGE_WIDTH | 794px |
| PAGE_HEIGHT | 1123px |
| MARGIN_TOP | 96px |
| MARGIN_BOTTOM | 96px |
| MARGIN_LEFT | 96px |
| MARGIN_RIGHT | 96px |
| CONTENT_HEIGHT | 931px |

---

## 5. Functional Requirements

### FR-1: Live Pagination
- **FR-1.1:** Content renders into fixed-size A4 portrait pages (794×1123px with 96px margins).
- **FR-1.2:** Pages are visible in the editor during editing, not only on print.
- **FR-1.3:** Live page numbers displayed (e.g., "Page 1 of N").
- **FR-1.4:** Editing reflows content across pages without visual glitches.

### FR-2: Save/Load
- **FR-2.1:** `POST /documents` stores document JSON, returns `{ id }`. Server sets `created_at` and `updated_at`.
- **FR-2.2:** `GET /documents/:id` returns full document JSON including `{ id, title, content, created_at, updated_at }`.
- **FR-2.3:** Storage is in-memory on the backend. Explicitly documented as not surviving server restart.
- **FR-2.4:** UI "Save" button assigns/updates an ID and persists the current document.
- **FR-2.5:** UI "Load by ID" input fetches and renders the saved document with identical content structure and pagination (within reasonable font tolerance).
- **FR-2.6:** Export/import to `.json` file as fallback is acceptable.

---

## 6. Non-Functional Requirements

- **NFR-1: Determinism.** Reloading the same document reproduces identical layout within reasonable font tolerance. Initial layout pass gated on `document.fonts.ready`.
- **NFR-2: Zero secrets.** No paid API keys or secrets required to run.
- **NFR-3: Code clarity.** Clean separation of editor state, pagination/layout logic, and persistence. Layout engine is a pure function with clear inputs and outputs.
- **NFR-4: Centralised constants.** All layout constants (page size, margins) defined in a single file.
- **NFR-5: Bounded reflow.** Reflow work is proportional to the change, not the full document length. Dirty-point tracking ensures only paragraphs from the edit point onwards are remeasured.
- **NFR-6: Single-command startup.** `npm install && npm run dev` (or equivalent) reliably starts the demo on a clean machine.

---

## 7. Acceptance Criteria

These are taken directly from the spec and will be tested during the live review:

| # | Criterion | Source |
|---|-----------|--------|
| AC-1 | Start app locally; open editor; type text; see page boundaries and numbers. | Spec: Acceptance Criteria |
| AC-2 | Add enough content to create ≥3 pages. | Spec: Acceptance Criteria |
| AC-3 | Click Save; receive an ID; refresh browser; Load by ID; document appears identically (content structure; pagination within reasonable tolerance). | Spec: Acceptance Criteria |
| AC-4 | No runtime errors in console during typical usage. | Spec: Acceptance Criteria |

### Live Review Expectations (30–45 min)
- Demonstrate page boundaries, page numbering, pagination reflow.
- Save → hard refresh → load by ID → compare layout.
- Code tour: editor state model, pagination algorithm, persistence layer, layout constants location.
- Q&A: tradeoffs, limitations, known bugs, next steps.

---

## 8. Deliverables

| # | Deliverable | Notes |
|---|-------------|-------|
| D-1 | Source code (GitHub or zip) | Frontend + backend |
| D-2 | `README.md` | Prereqs, setup, run commands, API endpoints with request/response examples, data model description, pagination strategy notes |
| D-3 | `ARCHITECTURE.md` | Editor state model, pagination algorithm, persistence flow |
| D-4 | `AI_USAGE.md` | AI tools used, tasks, prompts/codegen relied on |
| D-5 | Runnable demo | Single command startup, `.env.example` if needed |
| D-6 | AI chat logs (.md) | Complete conversation logs from all AI agents used |

---

## 9. Known Limitations (V1)

- **No mid-paragraph splitting.** Paragraphs that overflow are pushed entirely to the next page. Some whitespace wasted at page bottoms.
- **Very long single paragraphs.** A paragraph exceeding full page height is a known edge case; noted but not handled in V1.
- **Font rendering variance.** Mitigated by explicit web font loading and gating measurement on `document.fonts.ready`. Cross-platform differences remain possible.
- **In-memory storage.** Does not survive server restart. Documented explicitly.
- **No print output.** Visual page breaks don't translate to print CSS. Out of scope per spec.
- **Full reflow on each edit.** V1 remeasures from the dirty paragraph onwards but does not cache unaffected page layouts. Acceptable for documents under ~50 pages.

---

## 10. Future Extensions

### Extension 1: Mid-Paragraph Splitting (Post-V1, same session)

**Trigger:** Implement after V1 is stable and all acceptance criteria pass.

**What changes:**
- The layout engine already identifies the exact line where a page boundary falls within a boundary paragraph (Pass 2). Currently this information is unused — the whole paragraph is pushed.
- Add a `splitBoundaryParagraph` function that maps the break line to a text offset within the paragraph (using `Range` / `caretPositionFromPoint` or text node walking).
- Execute a TipTap split transaction at that offset with `addToHistory: false` to keep undo clean.
- The second half of the split paragraph receives the `margin-top` decoration — the same mechanism V1 already uses for pushed paragraphs.

**Additional complexity:**
- **Merge tracking:** A custom paragraph attribute (`continuedFrom: paragraphId`) tracks which paragraph pairs are split halves of the same original.
- **Merge on reflow:** On each layout pass, check whether previously split paragraphs can be reunified before measuring (e.g., user deleted content and the split is no longer needed).
- **Merge on save:** On save, walk the document tree, detect `continuedFrom` pairs, and merge them back into single paragraphs before sending to the API. The persisted document never contains artificial splits.
- **Cascading splits:** A paragraph spanning 3+ pages requires iterative splitting until no paragraph overflows. Converges because each split only makes paragraphs shorter.
- **Cursor preservation:** Verify cursor position is maintained through programmatic splits, particularly when the cursor is in the second half after a split.

**What doesn't change:** Layout engine passes 1 and 2, decoration mechanism, layout constants, persistence layer, backend API.

**Estimated additional effort:** 4–6 hours.

### Extension 2: Per-Page TipTap Instances (Future, not in 24hr scope)

**Rationale:** The decoration/margin approach reaches an architectural ceiling when production features are needed: headers/footers in page gaps, proper mid-paragraph rendering without CSS hacks, cross-page selection, and precise cursor behaviour at page boundaries.

**Approach:** Each page is its own TipTap editor instance mounted in a fixed-height container (`CONTENT_HEIGHT: 931px`, `overflow: hidden`). A `PageManager` orchestration layer owns content distribution across editors.

**Key implementation areas:**
- **Overflow detection:** `ResizeObserver` or post-transaction measurement on each editor. When content exceeds container height, signal the PageManager.
- **Bidirectional content redistribution:** Overflow from page N moves to page N+1. Deletion on page N pulls content back from page N+1. Must be atomic to avoid intermediate states.
- **Mid-paragraph splitting:** Native to this model — split at the overflow point in page N, create continuation at top of page N+1. Track split relationships for merge on backflow.
- **Cursor transitions:** Intercept ArrowDown/ArrowUp at page boundaries, focus the adjacent editor, place cursor at the corresponding position. Click-to-focus on any page.
- **Cross-page selection:** Either fake it with coordinated decorations across editors, or scope selection to single pages (acceptable for most use cases).
- **Persistence:** PageManager walks all editors, calls `getJSON()` on each, concatenates content arrays, merges split paragraphs. Document model stays TipTap JSON — page splits are never persisted.

**Performance characteristics:**
- Memory scales linearly (~2–5MB per TipTap instance). Fine for 5–20 pages; requires virtualisation (mount only visible pages) beyond that.
- Transaction processing is isolated to the active page — better keystroke latency than single-editor for long documents.
- Redistribution cascades (one edit propagating through all subsequent pages) are the expensive operation. Mitigated by batching: one page per animation frame.
- Initial load is slower (N editor instances to create). Mitigated by progressive hydration: mount page 1 immediately, hydrate rest in background.

**Estimated effort:** 40+ hours. Not feasible within the case study timebox but represents the production evolution path.

---

## 11. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Measurement-decoration feedback loop (decoration margins invalidate measurements) | High — visual glitches during demo | Medium | Decorations applied after measurement; margin only affects content below the decoration point; subsequent pages measured accounting for margin |
| Save/load round-trip lossy | High — direct acceptance criteria failure | Medium | No custom serialisation; save/load use getJSON/setContent directly; decorations not in document; explicit round-trip test during development |
| Font not loaded before initial measurement | High — incorrect pagination on reload | Medium | Gate first layout pass on `document.fonts.ready` |
| Architecture doc exceeds 2-page limit | Low — poor impression | High | Compress: one paragraph on approach rationale, focus on edit cycle and layout engine, keep persistence section minimal |
| Very long paragraph exceeding page height | Medium — visual break | Low | Note as known limitation; spec content is plain text, unlikely to occur during demo |
| Undo/redo interacts with layout updates | Medium — confusing behaviour during demo | Low | Decorations don't touch undo history; no document mutations from layout engine in V1 |
