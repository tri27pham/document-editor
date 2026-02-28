import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_TOP,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
} from "../shared/constants";

export function initCssVars(): void {
  const root = document.documentElement.style;
  root.setProperty("--page-width", `${PAGE_WIDTH}px`);
  root.setProperty("--page-height", `${PAGE_HEIGHT}px`);
  root.setProperty("--margin-top", `${MARGIN_TOP}px`);
  root.setProperty("--margin-bottom", `${MARGIN_BOTTOM}px`);
  root.setProperty("--margin-left", `${MARGIN_LEFT}px`);
  root.setProperty("--margin-right", `${MARGIN_RIGHT}px`);
}
