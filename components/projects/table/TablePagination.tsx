'use client';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
};

export default function TablePagination({ page, totalPages, total, limit, onPageChange }: Props) {
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Build page numbers: 1 2 3 ... last
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i <= 3 || i > totalPages - 2 || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  if (total === 0) return null;

  return (
    <div className="ep-pagination">
      <span className="ep-pagination-info">{from}–{to} of {total.toLocaleString()}</span>
      <div className="ep-pagination-buttons">
        <button className="ep-pagination-btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="ep-pagination-dots">…</span>
          ) : (
            <button
              key={p}
              className={`ep-pagination-btn ${p === page ? 'ep-pagination-btn-active' : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button className="ep-pagination-btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
      </div>
    </div>
  );
}
