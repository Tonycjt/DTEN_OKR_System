import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-full">
        <p className="text-sm font-semibold uppercase tracking-wide text-dten-blue">DTEN Weekly Execution</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">{title}</h1>
        <p className="mt-2 w-full max-w-[calc(100vw-2rem)] break-words text-sm leading-6 text-ink-600 md:max-w-3xl">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
