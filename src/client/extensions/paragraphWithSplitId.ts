import Paragraph from "@tiptap/extension-paragraph";

/**
 * Paragraph node with optional `splitId` attribute for line-by-line pagination.
 * Both halves of a split paragraph share the same splitId (UUID). Document order
 * identifies first half vs continuation. See docs/LINE_BY_LINE_PAGINATION.md.
 *
 * splitId is rendered as `data-split-id` on the DOM element so CSS can target
 * split halves (e.g. zeroing margin-bottom on first halves).
 * getJSON() includes splitId when set, or omits it when null (default).
 *
 * When the user presses Enter, the new paragraph must not inherit splitId so the
 * layout merge pass does not merge it back. We handle Enter by splitting the
 * block then clearing splitId on the new paragraph (the one containing the cursor).
 */
export const ParagraphWithSplitId = Paragraph.extend({
  addAttributes() {
    return {
      splitId: {
        default: null,
        renderHTML(attributes) {
          if (!attributes.splitId) return {};
          return { "data-split-id": attributes.splitId };
        },
        parseHTML(element) {
          return element.getAttribute("data-split-id") || null;
        },
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== "paragraph") return false;
        return this.editor
          .chain()
          .splitBlock()
          .updateAttributes(this.name, { splitId: null })
          .run();
      },
    };
  },
});
