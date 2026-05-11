import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
      <div className="mb-4 rounded-full bg-white p-3 text-slate-500 shadow-sm">
        <Inbox size={24} aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-ink-950">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
