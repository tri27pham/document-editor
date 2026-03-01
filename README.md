# Materi Document Editor

A browser-based document editor with live A4 pagination. Content flows across fixed-size pages as you type, with line-by-line (mid-paragraph) breaks when a paragraph spans a page boundary. Documents are saved and loaded via a simple JSON API.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+

## Setup

Clone the repo and install dependencies:

```bash
cd document-editor
npm install
```

Optional environment variables (see `.env.example`). No API keys or secrets are required.

## Run commands

**Start the app (frontend + backend):**

```bash
npm run dev
```

This runs the Vite dev server and the Express API with hot reload. Open http://localhost:5173 in your browser.

**Other scripts:**

| Command                 | Description                  |
|-------------------------|------------------------------|
| `npm run dev`           | Start frontend and backend   |
| `npm run dev:frontend`  | Start Vite only              |
| `npm run dev:backend`   | Start API only (port 3001)   |
| `npm run build`         | TypeScript check + Vite build|

---

## API endpoints

Base URL: `http://localhost:3001` (or value of `VITE_API_BASE` on the client).

### POST /documents

Create or update a document. Send `title` and `content`; optionally send `id` to update an existing document.

**Request:**

```bash
curl -X POST http://localhost:3001/documents \
  -H "Content-Type: application/json" \
  -d '{"title":"My doc","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}}'
```

**Response (create, 201):**

```json
{ "id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response (update, 200):** same `{ "id": "<existing-id>" }`.

**Validation:** `title` and `content` are required. Invalid body → `400` with `{ "error": "Missing or invalid title or content" }`.

---

### GET /documents/:id

Return the full document JSON.

**Request:**

```bash
curl http://localhost:3001/documents/550e8400-e29b-41d4-a716-446655440000
```

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My doc",
  "content": { "type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}] },
  "created_at": "2025-02-28T12:00:00.000Z",
  "updated_at": "2025-02-28T12:00:00.000Z"
}
```

**Not found:** `404` with `{ "error": "..." }`.

---

## Data model (document schema)

Documents are stored and transferred as **EditorDocument**:

| Field        | Type          | Description                                |
|--------------|---------------|--------------------------------------------|
| `id`         | `string`      | UUID; set by server on create               |
| `title`      | `string`      | Document title                             |
| `content`    | `JSONContent` | TipTap/ProseMirror document JSON           |
| `created_at` | `string`      | ISO 8601; set by server on create           |
| `updated_at` | `string`      | ISO 8601; set by server on create/update     |

**Content** is TipTap’s `getJSON()` format: a tree of nodes (e.g. `doc` → `paragraph` → `text`). Paragraphs may include an optional `splitId` attribute used for line-by-line pagination (halves of a split paragraph share the same UUID). Content is stored as-is; the server uses in-memory storage (`Map<string, EditorDocument>`); data does not survive a server restart.

---

## Pagination strategy and implementation

### Overview

- **Fixed page size:** A4 portrait (794×1123 px). Content area height = `CONTENT_HEIGHT` (page height minus top/bottom margins).
- **Layout constants** (single source of truth in `src/shared/constants.ts`): `PAGE_WIDTH`, `PAGE_HEIGHT`, margins (75 px), `PAGE_GAP` (40 px between pages), `PARAGRAPH_SPACING` (10 px), `MARGIN_STACK` (bottom margin + page gap + top margin, used for decoration `margin-top`), `DEFAULT_LINE_HEIGHT` (fallback when DOM is not yet available).
- **Flow:** On edit → merge any split paragraphs that should be re-measured → measure paragraphs (heights + per-line rects) → compute page entries (with mid-paragraph splits) → resolve split positions in the DOM → apply split transactions and build `LayoutResult` → dispatch to plugin → plugin applies decorations; overlay shows frames and “Page X of N”.

### Measurement

- The layout engine walks the ProseMirror document in sync with the DOM (`doc.forEach` + `view.nodeDOM(offset)`).
- For each top-level node (paragraph), it reads `getBoundingClientRect().height` and per-line rects via `Range.getClientRects()` on the paragraph contents. ProseMirror start offset is recorded for each node. When the DOM node is not yet available (e.g. new paragraph from Enter), `DEFAULT_LINE_HEIGHT` and empty line rects are used.

### Pagination algorithm

- **Input:** List of `ParagraphMeasurement` (proseMirrorPos, totalHeight, lineRects) and `CONTENT_HEIGHT`.
- **Core:** `computePageEntries()` walks measurements, reserves `height + PARAGRAPH_SPACING` per paragraph. If a paragraph doesn’t fit, it is split at line boundaries: lines that fit stay on the current page; the rest form overflow entries. Each split gets a shared `splitId` (UUID). Overflow that spans more than one page is split again in a loop. Entries that start a new page get a `decoration: { marginTop }` (remaining space + `MARGIN_STACK`).
- **Output:** List of `PageEntry` (height, lineRects, decoration, split). `buildLayoutResultFromEntries()` turns this into `LayoutResult`: `pageCount` and `pageStartPositions` (proseMirrorPos, pageNumber, remainingSpace).

### Split resolution and application

- `resolveSplitPositions()` uses `caretPositionFromPoint` at the first overflow line of each split to get a ProseMirror position and sets `split.resolvedPos`.
- `applySplitsAndDispatchLayout()` applies split transactions back-to-front (by resolvedPos), sets `splitId` on both halves of each split, builds `LayoutResult` from the resulting doc, and dispatches one transaction with `tr.setMeta('layoutResult', result)` and `addToHistory: false`. The layout plugin receives the result and builds decorations.

### Visual page breaks

- The layout plugin (`src/client/extensions/layoutPlugin.ts`) holds the current `LayoutResult` in plugin state. When the layout engine dispatches a transaction with `layoutResult` meta, the plugin builds **decorations**: for each `pageStartPositions` entry, it applies a `margin-top` on the paragraph at `proseMirrorPos`. The margin = `remainingSpace + MARGIN_STACK`. Decorations are visual only; they do not appear in `getJSON()` or affect undo/redo.

### Overlay

- A separate overlay layer (sibling to the editor content, `pointer-events: none`) draws one frame per page and “Page X of N” labels. Frames use `PAGE_WIDTH` and `PAGE_HEIGHT` from constants so boundaries align with the content.

### Scheduling and determinism

- Layout runs on the editor **transaction** event when `docChanged` is true, scheduled with `requestAnimationFrame` to batch rapid edits. Transactions that already carry `layoutResult` meta are ignored.
- The **first** layout run is gated on `document.fonts.ready` so measurements are stable after fonts load (e.g. on reload). That keeps pagination deterministic for the same content and fonts.

### Summary

| Step                 | Where                         | Output / effect                                   |
|----------------------|-------------------------------|----------------------------------------------------|
| Merge splits         | `mergeSplitParagraphs()`      | Re-joins paragraphs with same splitId              |
| Measure              | `measureParagraphs()`        | `ParagraphMeasurement[]` (proseMirrorPos, height, lineRects) |
| Paginate             | `computePageEntries()`        | `PageEntry[]` (with splits and decorations)       |
| Resolve positions    | `resolveSplitPositions()`     | Sets `resolvedPos` on split entries                |
| Apply splits + layout| `applySplitsAndDispatchLayout()` | Split transactions + `LayoutResult` → plugin   |
| Apply gaps           | Layout plugin                 | `margin-top` decorations via `MARGIN_STACK`        |
| Overlay              | PageOverlay component         | Frames + “Page X of N”                             |

All layout constants live in `src/shared/constants.ts` and are mirrored to CSS variables at startup (`src/client/initCssVars.ts`) so the editor and overlay use the same values.

## Known Limitations
- Split paragraphs do not merge back when content reflows to fit on one page (splitId infrastructure is in place but merge logic is incomplete)
- Typing in the middle of the last line of a page can cause characters to appear on separate lines
- Pasting large content may not paginate correctly
- A single paragraph taller than one page will overflow the page boundary rather than splitting across pages
- Data is stored in-memory; documents do not survive a server restart