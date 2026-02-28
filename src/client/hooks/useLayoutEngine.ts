import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { measureParagraphs, computeLayout } from "../engine/layout";
import { CONTENT_HEIGHT } from "../../shared/constants";

/**
 * Custom hook that runs the layout engine: measures paragraphs, computes page breaks,
 * dispatches LayoutResult to the plugin, and exposes pageCount.
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
      const measurements = measureParagraphs(editor);
      const result = computeLayout(measurements, CONTENT_HEIGHT);
      lastLayoutDocRef.current = editor.state.doc;
      setPageCount(result.pageCount);
      editor.view.dispatch(
        editor.state.tr.setMeta("layoutResult", result).setMeta("addToHistory", false)
      );
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

    editor.on("update", scheduleLayout);

    return () => {
      editor.off("update", scheduleLayout);
      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
      }
    };
  }, [editor]);

  return pageCount;
}
