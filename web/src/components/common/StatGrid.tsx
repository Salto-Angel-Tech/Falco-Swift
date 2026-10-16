import type { ReactNode } from "react";

export function StatGrid({ stats }: { stats: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col-reverse rounded-md bg-surface-low px-4 py-3">
          <dt className="mt-1 label-caps text-text-3">{stat.label}</dt>
          <dd className="font-mono text-stat-lg font-semibold text-foreground">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
