import { TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRunningJob } from "@/hooks/queries";

/** Container: warns that a running train job competes for memory with a loaded model. */
export function TrainRunningWarning() {
  const job = useRunningJob("train");
  if (!job) return null;
  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertTitle>A training job is running</AlertTitle>
      <AlertDescription>
        <p>
          Loading or using a model now competes with{" "}
          <Link className="text-primary underline-offset-4 hover:underline" to={`/jobs/${job.id}`}>
            {job.id}
          </Link>{" "}
          for memory and may slow both down or run out of memory.
        </p>
      </AlertDescription>
    </Alert>
  );
}
