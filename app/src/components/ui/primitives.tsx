import type { DataStatus, Provenance } from '@/data/types';

const STATUS_STYLE: Record<DataStatus, { bg: string; label: string }> = {
  'source-verified': { bg: 'bg-ok/15 text-ok border-ok/40', label: 'Source · verified' },
  source: { bg: 'bg-info/15 text-info border-info/40', label: 'Source document' },
  external: { bg: 'bg-info/15 text-info border-info/40', label: 'External data' },
  approximate: { bg: 'bg-warn/15 text-warn border-warn/40', label: 'Approximate' },
  assumed: { bg: 'bg-warn/15 text-warn border-warn/40', label: 'Assumed' },
  'user-calibrated': { bg: 'bg-accent/15 text-accent border-accent/40', label: 'User calibrated' },
  unverified: { bg: 'bg-bad/15 text-bad border-bad/40', label: 'Unverified' },
};

export function StatusBadge({ status, title }: { status: DataStatus; title?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${s.bg}`}>
      {s.label}
    </span>
  );
}

export function ProvenanceNote({ p }: { p: Provenance }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-fg-muted">
      <div><StatusBadge status={p.status} /></div>
      {p.source && <div><span className="label">Source</span> {p.source}</div>}
      {p.note && <div>{p.note}</div>}
    </div>
  );
}

export function Panel({ title, children, className = '', right }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={`panel p-3 ${className}`}>
      {(title || right) && (
        <header className="mb-2 flex items-center justify-between gap-2">
          {title && <h2 className="label">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <span className="text-lg leading-tight text-fg">{value}</span>
      {sub && <span className="text-xs text-fg-muted">{sub}</span>}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line p-6 text-center">
      <div className="text-sm text-fg">{title}</div>
      {body && <div className="max-w-sm text-xs text-fg-muted">{body}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-fg-muted">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}
