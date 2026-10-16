import { CircleAlert } from "lucide-react";
import { errorMessage } from "@/api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Inline destructive alert for a thrown value; renders nothing when there is no error. */
export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription className="break-words">
        {title ? `${title}: ` : ""}
        {errorMessage(error)}
      </AlertDescription>
    </Alert>
  );
}
