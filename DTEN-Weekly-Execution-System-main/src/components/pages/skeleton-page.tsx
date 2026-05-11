import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { OkrPreviewTable } from "@/components/dashboard/okr-preview-table";
import { checkIns, departments, mockUsers, objectives, pageDescriptions, placeholderStats, teams, users, weeklyReports } from "@/mock-data";
import { getCurrentWeek, getWeeklyUpdateCompliance } from "@/lib/weekly-execution";

type SkeletonPageProps = {
  title: keyof typeof pageDescriptions;
  variant?: "default" | "table" | "admin";
};

export function SkeletonPage({ title, variant = "default" }: SkeletonPageProps) {
  const stats = [
    ...placeholderStats,
    {
      label: "Weekly Updates",
      value: `${getWeeklyUpdateCompliance({ checkIns, objectives, users, week: getLatestMockWeek() })}%`,
      tone: "success" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={pageDescriptions[title]}
        actions={
          <Button variant="secondary" disabled>
            Prototype only
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {variant === "table" ? <OkrPreviewTable /> : null}

      {variant === "admin" ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-ink-950">Mock user context</h2>
            <p className="mt-1 text-sm text-ink-600">These roles are available in the top bar switcher.</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {mockUsers.map((user) => (
              <div key={user.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-ink-950">{user.role}</p>
                <p className="mt-1 text-sm text-ink-600">{user.name}</p>
                <p className="mt-1 text-xs text-ink-600">
                  {departments.find((department) => department.id === user.departmentId)?.name} /{" "}
                  {teams.find((team) => team.id === user.teamId)?.name}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <EmptyState
        title={`${title} workflows are not built yet`}
        description="This page is part of the Phase 0 product skeleton. It establishes navigation, layout, visual language, and mock context without implementing product workflows."
      />
    </div>
  );
}

function getLatestMockWeek() {
  const latestReport = [...weeklyReports].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))[0];

  if (!latestReport) {
    return getCurrentWeek();
  }

  return {
    week_start_date: latestReport.weekStartDate,
    week_end_date: latestReport.weekEndDate,
  };
}
