import Paragraph from "@tiptap/extension-paragraph";

/**
 * Paragraph node with optional `splitId` attribute for line-by-line pagination.
 * Both halves of a split paragraph share the same splitId (UUID). Document order
 * identifies first half vs continuation. See docs/LINE_BY_LINE_PAGINATION.md.
 *
 * `rendered: false` keeps splitId out of the DOM — it is stored in the document
 * model and in getJSON() but not rendered as an HTML attribute.
 */
export const ParagraphWithSplitId = Paragraph.extend({
  addAttributes() {
    return {
      splitId: {
        default: null,
        rendered: false,
      },
    };
  },
});
