import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export function RoutePlaceholder({
  title,
  description,
  requirements,
}: {
  title: string;
  description: string;
  requirements: string[];
}) {
  return (
    <div className="stack">
      <PageHeader title={title} description={description} />
      <Card>
        <CardHeader>
          <h2>Release 1 Requirements</h2>
          <p>This route is scaffolded and ready for implementation in its milestone.</p>
        </CardHeader>
        <CardContent>
          <div className="route-grid">
            {requirements.map((requirement) => (
              <div className="route-item" key={requirement}>
                <span>{requirement}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
