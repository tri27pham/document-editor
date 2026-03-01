# Architecture

## Editor State Model

The editor is built on TipTap (which wraps ProseMirror). The document is a tree of typed nodes:

```
doc
 └─ paragraph (attrs: { splitId?: string })
     └─ text (with optional marks: bold, italic, etc.)
```

**EditorState** holds:
- **doc** — the immutable document tree (`JSONContent`). Every edit produces a new doc via a transaction.
- **selection** — cursor/selection position.
- **plugin state** — each plugin (e.g. the layout plugin) stores its own state keyed by a `PluginKey`.

The layout plugin (`layoutPluginKey`) stores:
- `layoutResult: LayoutResult | null` — current page count and page start positions.
- `decorations: DecorationSet` — visual-only margin-top styles that create page gaps.

State flows one way: user edits → transaction → new EditorState → layout engine runs → layout result dispatched back via transaction meta → plugin updates decorations.

The paragraph schema is extended with an optional `splitId` attribute. When a paragraph is split across a page boundary, both halves share the same `splitId` (a UUID) so the layout engine can merge them back before re-measuring.

## Pagination Algorithm

Layout runs on every document change, scheduled with `requestAnimationFrame` to batch rapid edits into one layout per frame. The first run is gated on `document.fonts.ready` for stable measurements.

### Pipeline

```
Edit → Merge → Measure → Paginate → Resolve → Split & Dispatch → Decorate
```

**1. Merge** (`mergeSplitParagraphs`)
Adjacent paragraphs with the same `splitId` are joined back into one paragraph (back-to-front to keep positions valid). This undoes previous splits so the full paragraph can be re-measured.

**2. Measure** (`measureParagraphs`)
Single DOM read pass: walks `doc.forEach` in lockstep with `view.nodeDOM(offset)`. For each top-level node collects:
- `proseMirrorPos` — ProseMirror document offset
- `totalHeight` — `getBoundingClientRect().height`
- `lineRects` — per-line rectangles via `Range.getClientRects()`

**3. Paginate** (`computePageEntries`)
Pure function (no DOM access). Walks measurements and accumulates height per page:
- **Fits:** paragraph added to current page.
- **Doesn't fit, has line rects:** finds the last line that fits (`splitAfterLine`), creates a split entry for the fitting lines and an overflow entry for the rest. Both share a `splitId`. If overflow exceeds one page, the loop splits again.
- **Doesn't fit, no line rects / first line too tall:** whole paragraph pushed to next page.

Each entry that starts a new page gets `decoration: { marginTop }` = remaining space on the previous page + `MARGIN_STACK` (bottom margin + page gap + top margin).

**4. Resolve** (`resolveSplitPositions`)
For each split entry, finds the ProseMirror document position at the start of the first overflow line using `caretPositionFromPoint` on the overflow line's DOM rectangle, then `view.posAtDOM` to convert to a document offset. Validated to be inside the source paragraph.

**5. Split & Dispatch** (`applySplitsAndDispatchLayout`)
Applies `tr.split()` at each resolved position (back-to-front). Sets `splitId` on both halves. Builds `LayoutResult` from the post-split document and dispatches one transaction with `setMeta('layoutResult', result)` and `addToHistory: false`.

**6. Decorate** (Layout Plugin)
Plugin receives the `LayoutResult` via transaction meta, builds `Decoration.node` with `margin-top` styles for each page start position. Between layout runs, decorations are mapped through document changes to stay approximately correct.

### Constants

All layout constants are centralised in `src/shared/constants.ts`:

| Constant           | Value   | Purpose                        |
|--------------------|---------|--------------------------------|
| `PAGE_WIDTH`       | 794 px  | A4 width                      |
| `PAGE_HEIGHT`      | 1123 px | A4 height                     |
| `MARGIN_TOP/BOTTOM`| 75 px   | Page margins                  |
| `CONTENT_HEIGHT`   | 973 px  | Usable content area per page   |
| `PAGE_GAP`         | 40 px   | Visual gap between pages       |
| `PARAGRAPH_SPACING`| 10 px   | Space between paragraphs       |
| `MARGIN_STACK`     | 190 px  | Bottom + gap + top (decoration)|

## Persistence Flow

```
┌────────────┐         POST /documents          ┌────────────┐
│            │  ──────────────────────────────►  │            │
│   Client   │  { id?, title, content }          │   Server   │
│  (React)   │                                   │  (Express) │
│            │  ◄──────────────────────────────  │            │
│            │  { id }  (201 create / 200 update) │            │
│            │                                   │            │
│            │         GET /documents/:id         │            │
│            │  ──────────────────────────────►  │            │
│            │                                   │            │
│            │  ◄──────────────────────────────  │            │
│            │  { id, title, content,            │            │
│            │    created_at, updated_at }        │            │
└────────────┘                                   └────────────┘
                                                  In-memory Map
```

**Save:** Toolbar calls `saveDocument({ id?, title, content: editor.getJSON() })`. The API client POSTs to `/documents`. Server generates a UUID if no `id`, stores the document in `Map<string, EditorDocument>`, returns `{ id }`. The toolbar displays the ID.

**Load:** User enters an ID in the toolbar input. The API client GETs `/documents/:id`. On success, `editor.commands.setContent(doc.content)` replaces the editor state. The layout engine detects the doc change and re-paginates.

**Storage:** In-memory `Map`. Explicit trade-off: simple and no dependencies, but data does not survive a server restart. The document schema (`EditorDocument`) is shared between client and server via `src/shared/types.ts`.
```