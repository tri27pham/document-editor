import { useMemo } from "react";
import {
  EditorContext,
  EditorContent,
  useEditor,
  useCurrentEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ParagraphWithSplitId } from "../extensions/paragraphWithSplitId";
import { LayoutPlugin } from "../extensions/layoutPlugin";
import { PageOverlay } from "./PageOverlay";
import { Toolbar } from "./Toolbar";
import { useLayoutEngine } from "../hooks/useLayoutEngine";

const extensions = [
  StarterKit.configure({ paragraph: false }),
  ParagraphWithSplitId,
  LayoutPlugin,
];
const initialContent = "";

/**
 * Renders PageOverlay with pageCount from the layout engine.
 * Must be used inside EditorContext so useCurrentEditor and useLayoutEngine have the editor.
 */
function LayoutAndOverlay() {
  const { editor } = useCurrentEditor();
  const pageCount = useLayoutEngine(editor ?? null);
  return <PageOverlay pageCount={pageCount} />;
}

/**
 * Sets up the editor with EditorContext (EditorProvider pattern) and renders
 * Toolbar, then editor-container with EditorContent + PageOverlay so the overlay
 * positions correctly over the content.
 */
export function EditorWrapper() {
  const editor = useEditor({
    extensions,
    content: initialContent,
  });

  const contextValue = useMemo(() => ({ editor }), [editor]);

  if (!editor) return null;

  return (
    <EditorContext.Provider value={contextValue}>
      <Toolbar />
      <div className="editor-container">
        <EditorContent editor={editor} className="editor" />
        <LayoutAndOverlay />
      </div>
    </EditorContext.Provider>
  );
}
