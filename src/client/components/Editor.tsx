import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { measureParagraphs, computeLayout } from "../engine/layout";
import { CONTENT_HEIGHT } from "../../shared/constants";
import { LayoutPlugin } from "../extensions/layoutPlugin";
import { PageOverlay } from "./PageOverlay";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * Layout is scheduled with requestAnimationFrame so it runs on the next frame
 * (~16ms) after the last edit, reducing visible delay before page-break margins appear.
 * Rapid edits still batch into a single layout per frame.
 */
export function Editor() {
  const [pageCount, setPageCount] = useState(1);

  const editor = useEditor({
    extensions: [StarterKit, LayoutPlugin],
    content: "<p>Start typing…</p>",
  });

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

  return (
    <>
      <PageOverlay pageCount={pageCount} />
      <EditorContent editor={editor} className="editor" />
    </>
  );
}
