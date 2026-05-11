import { OkrForm } from "@/components/okrs/okr-form";
import { objectives } from "@/mock-data";

type EditOkrPageProps = {
  params: {
    objectiveId: string;
  };
};

export default function EditOkrPage({ params }: EditOkrPageProps) {
  return <OkrForm objectiveId={params.objectiveId} />;
}

export function generateStaticParams() {
  return objectives.map((objective) => ({
    objectiveId: objective.id,
  }));
}
