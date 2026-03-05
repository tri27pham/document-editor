import Paragraph from "@tiptap/extension-paragraph";

/**
 * Paragraph node with optional `splitId` attribute for line-by-line pagination.
 * Both halves of a split paragraph share the same splitId (UUID). Document order
 * identifies first half vs continuation. See docs/LINE_BY_LINE_PAGINATION.md.
 *
 * splitId is rendered as `data-split-id` on the DOM element so CSS can target
 * split halves (e.g. zeroing margin-bottom on first halves).
 * getJSON() includes splitId when set, or omits it when null (default).
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
});
