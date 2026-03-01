import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  mergeSplitParagraphs,
  measureParagraphs,
  computePageEntries,
  resolveSplitPositions,
  applySplitsAndDispatchLayout,
} from "../engine/layout";
import { CONTENT_HEIGHT } from "../../shared/constants";

/**
 * Custom hook that runs the layout engine: measures paragraphs, computes page entries
 * (with line-by-line splits when needed), resolves split positions, applies split
 * transactions and builds LayoutResult, dispatches to the plugin, and exposes pageCount.
 * Uses requestAnimationFrame for scheduling and gates the first run on document.fonts.ready.
 */
export function useLayoutEngine(editor: Editor | null): number {
  const [pageCount, setPageCount] = useState(1);
  const layoutRafRef = useRef<number | null>(null);
  const firstLayoutDoneRef = useRef(false);
  const lastLayoutDocRef = useRef<ProseMirrorNode | null>(null);

  useEffect(() => {
    if (!editor) return;

    const runLayout = (): void => {
      mergeSplitParagraphs(editor);
      const measurements = measureParagraphs(editor);
      const pageEntries = computePageEntries(measurements, CONTENT_HEIGHT);
      resolveSplitPositions(editor, pageEntries);

      const result = applySplitsAndDispatchLayout(editor, pageEntries);
      lastLayoutDocRef.current = editor.state.doc;
      setPageCount(result.pageCount);
    };

    const scheduleLayout = (): void => {
      if (editor.state.doc === lastLayoutDocRef.current) return;
      if (layoutRafRef.current !== null) cancelAnimationFrame(layoutRafRef.current);
      layoutRafRef.current = requestAnimationFrame(() => {
        layoutRafRef.current = null;
        if (!firstLayoutDoneRef.current) {
          document.fonts.ready.then(() => {
            firstLayoutDoneRef.current = true;
            runLayout();
          });
        } else {
          runLayout();
        }
      });
    };

    const handleTransaction = ({ transaction }: { transaction: Transaction }): void => {
      if (transaction.getMeta("layoutResult") !== undefined) return;
      if (!transaction.docChanged) return;
      scheduleLayout();
    };

    editor.on("transaction", handleTransaction);

    return () => {
      editor.off("transaction", handleTransaction);
      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
      }
    };
  }, [editor]);

  return pageCount;
}
