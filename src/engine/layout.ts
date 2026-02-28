export interface LayoutResult {
  pageBreaks: number[];
  textStartY: number[];
  pageCount: number;
}

/**
 * Pure layout function: reads paragraph measurements, returns page break positions.
 *
 * Pass 1: batch-read paragraph heights from dirty point onwards.
 * Pass 2: line-level measurement on boundary paragraphs only.
 */
export function computeLayout(
  _paragraphHeights: number[],
  _contentHeight: number
): LayoutResult {
  // TODO: implement pagination algorithm
  return { pageBreaks: [], textStartY: [0], pageCount: 1 };
}
