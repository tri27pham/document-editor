import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { measureParagraphs, computeLayout } from "../engine/layout";
import { CONTENT_HEIGHT } from "../../shared/constants";
import { LayoutPlugin } from "../extensions/layoutPlugin";
import { PageOverlay } from "./PageOverlay";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

const LAYOUT_DEBOUNCE_MS = 120;

export function Editor() {
  const [pageCount, setPageCount] = useState(1);

  const editor = useEditor({
    extensions: [StarterKit, LayoutPlugin],
    content: "<p>Start typing…</p>",
  });

  const layoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (layoutTimeoutRef.current !== null) {
        clearTimeout(layoutTimeoutRef.current);
      }
      layoutTimeoutRef.current = setTimeout(async () => {
        layoutTimeoutRef.current = null;
        if (!firstLayoutDoneRef.current) {
          await document.fonts.ready;
          firstLayoutDoneRef.current = true;
        }
        runLayout();
      }, LAYOUT_DEBOUNCE_MS);
    };

    editor.on("update", scheduleLayout);

    return () => {
      editor.off("update", scheduleLayout);
      if (layoutTimeoutRef.current !== null) {
        clearTimeout(layoutTimeoutRef.current);
        layoutTimeoutRef.current = null;
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
