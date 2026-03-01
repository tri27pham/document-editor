import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { LayoutResult } from "../../shared/types";
import { MARGIN_STACK } from "../../shared/constants";

/**
 * Plugin state: layout result (for consumers) and decoration set (mapped across doc changes when layout is stale).
 */
export interface LayoutPluginState {
  layoutResult: LayoutResult | null;
  decorations: DecorationSet;
}

/**
 * Meta key for dispatching the current layout result into the plugin.
 * New LayoutResult values are dispatched via tr.setMeta('layoutResult', newLayoutResult).
 */
export const layoutPluginKey = new PluginKey<LayoutPluginState>("layout");

function buildDecorations(layout: LayoutResult, doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  for (const entry of layout.pageStartPositions) {
    const node = doc.nodeAt(entry.proseMirrorPos);
    if (!node) continue;
    const from = entry.proseMirrorPos;
    const to = entry.proseMirrorPos + node.nodeSize;
    const marginTopPx = entry.remainingSpace + MARGIN_STACK;
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
          init(_config, state): LayoutPluginState {
            return {
              layoutResult: null,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, value, _oldState, newState): LayoutPluginState {
            const meta = tr.getMeta("layoutResult");
            if (meta !== undefined) {
              const layoutResult = meta as LayoutResult;
              const decorations = buildDecorations(layoutResult, newState.doc);
              return { layoutResult, decorations };
            }
            if (tr.docChanged && value.decorations !== DecorationSet.empty) {
              return {
                layoutResult: value.layoutResult,
                decorations: value.decorations.map(tr.mapping, newState.doc),
              };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = layoutPluginKey.getState(state);
            if (!pluginState || pluginState.decorations === DecorationSet.empty) return null;
            return pluginState.decorations;
          },
        },
      }),
    ];
  },
});
