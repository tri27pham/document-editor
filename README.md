# Materi Document Editor

A browser-based document editor with live A4 pagination. Content flows across fixed-size pages as you type; documents are saved and loaded via a simple JSON API.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+

## Setup

Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd document-editor
npm install
```

No environment variables or API keys are required. The backend runs on port **3001**; the frontend (Vite) runs on port **5173** by default.

## Run commands

**Start the app (frontend + backend):**

```bash
npm run dev
```

This runs the Vite dev server and the Express API with hot reload. Open http://localhost:5173 in your browser.

**Other scripts:**

| Command            | Description                    |
|--------------------|--------------------------------|
| `npm run dev`      | Start frontend and backend     |
| `npm run dev:frontend` | Start Vite only           |
| `npm run dev:backend`  | Start API only (port 3001) |
| `npm run build`    | TypeScript check + Vite build  |

---

## API endpoints

Base URL: `http://localhost:3001`

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

| Field         | Type        | Description                                |
|---------------|-------------|--------------------------------------------|
| `id`          | `string`    | UUID; set by server on create               |
| `title`       | `string`    | Document title                              |
| `content`     | `JSONContent` | TipTap/ProseMirror document JSON        |
| `created_at`  | `string`    | ISO 8601; set by server on create          |
| `updated_at`  | `string`    | ISO 8601; set by server on create/update  |

**Content** is TipTap’s `getJSON()` format: a tree of nodes (e.g. `doc` → `paragraph` → `text`). It is stored as-is; no separate paragraph/run schema is imposed. The server uses in-memory storage (`Map<string, EditorDocument>`); data does not survive a server restart.

---

## Pagination strategy and implementation

### Overview

- **Fixed page size:** A4 portrait (794×1123 px). Content area height = 931 px (page height minus top/bottom margins).
- **Layout constants** (single source of truth in `src/shared/constants.ts`): page dimensions, margins (96 px), `PAGE_GAP` (40 px between pages), `PARAGRAPH_SPACING` (10 px between paragraphs).
- **Flow:** On edit → measure paragraphs from the DOM → run pagination algorithm → get `LayoutResult` → apply decorations (page gaps) and overlay (frames + “Page X of N”).

### Measurement

- The layout engine walks the ProseMirror document in sync with the DOM (`doc.forEach` + `view.nodeDOM(offset)`).
- For each top-level node (e.g. paragraph), it reads `getBoundingClientRect().height` and the ProseMirror start offset. Paragraph spacing is **not** measured; it is added from the constant when accumulating height.

### Pagination algorithm

- **Input:** List of `{ height, pmPos }` per paragraph and `CONTENT_HEIGHT` (931 px).
- **Rule:** For each paragraph, reserve `height + PARAGRAPH_SPACING`. If that doesn’t fit on the current page, the **whole paragraph** moves to the next page (no mid-paragraph breaks in this version).
- **Output — LayoutResult:**
  - `pageCount`: total pages.
  - `pageStartPositions`: for each page after the first, `{ proseMirrorPos, pageNumber, remainingSpace }`. `remainingSpace` is the unused height on the previous page when the break was chosen; it is used to size the visual gap.

### Visual page breaks

- A TipTap plugin holds the current `LayoutResult` in plugin state. When the layout engine runs, it dispatches a transaction with `tr.setMeta('layoutResult', result)` (and `addToHistory: false`).
- The plugin builds **decorations**: for each `pageStartPositions` entry, it applies a `margin-top` on the paragraph at `proseMirrorPos`. The margin = `remainingSpace + MARGIN_BOTTOM + PAGE_GAP + MARGIN_TOP`, so the gap between pages looks correct.
- Decorations are visual only; they do not appear in `getJSON()` or affect undo/redo.

### Overlay

- A separate overlay layer (sibling to the editor content, `pointer-events: none`) draws one frame per page and “Page X of N” labels. Frames are stacked using the same page height and gap as the content so boundaries align in normal flow.

### Scheduling and determinism

- Layout runs on the editor **update** event, scheduled with `requestAnimationFrame` to batch rapid edits.
- The **first** layout run is gated on `document.fonts.ready` so measurements are stable after fonts load (e.g. on reload). That keeps pagination deterministic for the same content and fonts.

### Summary

| Step            | Where                    | Output / effect                          |
|-----------------|--------------------------|------------------------------------------|
| Measure         | `measureParagraphs()`   | `{ height, pmPos }[]`                    |
| Paginate        | `computeLayout()`        | `LayoutResult` (pageCount, pageStarts)   |
| Apply gaps      | Layout plugin            | `margin-top` decorations on new-page pars |
| Apply overlay   | PageOverlay component    | Frames + “Page X of N”                   |

All layout constants live in `src/shared/constants.ts` and are mirrored to CSS variables at startup (`src/client/initCssVars.ts`) so the editor and overlay use the same values.
