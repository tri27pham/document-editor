import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { LayoutResult } from "../../shared/types";
import { MARGIN_BOTTOM, MARGIN_TOP, PAGE_GAP } from "../../shared/constants";

/**
 * Meta key for dispatching the current layout result into the plugin.
 * New LayoutResult values are dispatched via tr.setMeta('layoutResult', newLayoutResult).
 */
export const layoutPluginKey = new PluginKey<LayoutResult | null>("layout");

function buildDecorations(layout: LayoutResult, doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  const marginConst = MARGIN_BOTTOM + PAGE_GAP + MARGIN_TOP;

  for (const entry of layout.pageStartPositions) {
    const node = doc.nodeAt(entry.proseMirrorPos);
    if (!node) continue;
    const from = entry.proseMirrorPos;
    const to = entry.proseMirrorPos + node.nodeSize;
    const marginTopPx = entry.remainingSpace + marginConst;
    decorations.push(
      Decoration.node(from, to, { style: `margin-top: ${marginTopPx}px` })
    );
  }

  return DecorationSet.create(doc, decorations);
}

export const LayoutPlugin = Extension.create({
  name: "layout",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: layoutPluginKey,
        state: {
          init(): LayoutResult | null {
            return null;
          },
          apply(tr, value): LayoutResult | null {
            const meta = tr.getMeta("layoutResult");
            if (meta !== undefined) return meta as LayoutResult;
            return value;
          },
        },
        props: {
          decorations(state) {
            const layout = layoutPluginKey.getState(state);
            if (!layout) return null;
            return buildDecorations(layout, state.doc);
          },
        },
      }),
    ];
  },
});
