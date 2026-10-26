export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <dl className="m-0 flex flex-col gap-1 rounded-[var(--radius-md)] border-2 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <dt className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="m-0 text-3xl font-bold">{value}</dd>
      {hint ? <dd className="m-0 text-sm text-[var(--color-text-muted)]">{hint}</dd> : null}
    </dl>
  );
}
