import { PAGE_WIDTH, PAGE_HEIGHT } from "../constants/layout";

interface PageOverlayProps {
  pageCount: number;
}

export function PageOverlay({ pageCount }: PageOverlayProps) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="page-overlay">
      {pages.map((pageNum) => (
        <div
          key={pageNum}
          className="page-frame"
          style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
        >
          <span className="page-number">
            Page {pageNum} of {pageCount}
          </span>
        </div>
      ))}
    </div>
  );
}
