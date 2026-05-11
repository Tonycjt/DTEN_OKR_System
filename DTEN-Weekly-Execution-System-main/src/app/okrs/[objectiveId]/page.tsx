import { OkrDetailView } from "@/components/okrs/okr-detail-view";
import { objectives } from "@/mock-data";

type OkrDetailPageProps = {
  params: {
    objectiveId: string;
  };
};

export default function OkrDetailPage({ params }: OkrDetailPageProps) {
  return <OkrDetailView objectiveId={params.objectiveId} />;
}

export function generateStaticParams() {
  return objectives.map((objective) => ({
    objectiveId: objective.id,
  }));
}
