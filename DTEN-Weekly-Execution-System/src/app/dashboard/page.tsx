import { ArrowRight } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { dayOneCompleted, releaseOneMilestones } from "@/lib/release-one";

export default function DashboardPage() {
  const upcoming = releaseOneMilestones.slice(dayOneCompleted.length, dayOneCompleted.length + 6);

  return (
    <div className="stack">
      <PageHeader
        title="Release 1 Command Center"
        description="Foundation for the OKR weekly execution loop: Objective to KR, weekly priority, check-in, manager review, and dashboard visibility."
        actions={
          <LinkButton href="/weekly-report/current">
            Start Weekly Report
            <ArrowRight size={16} aria-hidden="true" />
          </LinkButton>
        }
      />

      <div className="grid grid-3">
        <StatCard label="Release scope" value="19" detail="milestones" tone="info" />
        <StatCard label="Day 1 foundation" value={`${dayOneCompleted.length}`} detail="ready" tone="success" />
        <StatCard label="Next build area" value="DB" detail="Day 2" tone="warning" />
      </div>

      <div className="grid grid-2">
        <Card>
          <CardHeader>
            <h2>Day 1 Completed</h2>
            <p>Project shell and navigation surfaces now exist in the active folder.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {dayOneCompleted.map((item) => (
                <div className="route-item" key={item}>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2>Next Milestones</h2>
            <p>These are the next items from the PRD build order.</p>
          </CardHeader>
          <CardContent>
            <div className="route-grid">
              {upcoming.map((item) => (
                <div className="route-item" key={item}>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
