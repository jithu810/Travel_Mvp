import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 max-w-xl text-sm leading-6 text-stone-600">{children}</div>
    </section>
  );
}
