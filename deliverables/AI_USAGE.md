# AI Usage

## Tools Used

- **Claude** — architecture decisions, debugging, explaining ProseMirror/TipTap concepts, code review, documentation drafting
- **Cursor** — code generation, refactoring, inline completions

## How AI Was Used

### Architecture & Design
- Discussed pagination strategies (paragraph-level vs line-level splitting)
- Explored ProseMirror plugin patterns for decoration-based page breaks
- Decided on the merge-measure-paginate-split pipeline structure
- Evaluated trade-offs between different approaches 

### Code Generation (Cursor)
- Scaffolding: initial project setup, Express server, React components
- Generated boilerplate for TipTap extensions, ProseMirror plugin structure
- Refactored `Editor` component to use `EditorProvider` and `useCurrentEditor` pattern
- Extracted layout logic into `useLayoutEngine` custom hook

### Debugging
- Diagnosing ProseMirror transaction issues (`tr.split` creating text node errors)
- Understanding `ResolvedPos`, `nodeBefore`/`nodeAfter` behaviour after splits
- Investigating why `caretPositionFromPoint` returned positions at paragraph boundaries
- Debugging decoration positioning and `MARGIN_STACK` calculations

### Documentation
- Drafting README structure, API examples, and pagination strategy notes
- ARCHITECTURE.md content and diagrams
- Code comments and JSDoc annotations

## What Was Written Manually
- Core pagination algorithm logic 
- Layout engine pipeline design and integration
- Split resolution and merge logic
- All final code decisions, debugging, and testing
- Project structure and file organisation

## Chat Logs
Full AI chat logs are included in `AI_CHAT_LOGS.md`.