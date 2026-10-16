import { Boxes, CircleCheck, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/api/client";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { SectionCard } from "@/components/common/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveModel, useLoadModel, useModels } from "@/hooks/queries";
import { fixed, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Container: trained model folders with a Load action and the active model. */
export function ModelsTable() {
  const models = useModels();
  const active = useActiveModel();
  const load = useLoadModel();
  const info = active.data?.active;

  const onLoad = (folder: string) =>
    load.mutate(folder, {
      onSuccess: (model) => {
        active.refetch();
        toast.success(`Loaded ${model.folder}`, { description: `on ${model.device}` });
      },
      onError: (error) => toast.error(`Could not load ${folder}`, { description: errorMessage(error) }),
    });

  return (
    <SectionCard
      title="Models"
      icon={Boxes}
      actions={
        <Button variant="outline" size="sm" onClick={() => models.refetch()} disabled={models.isFetching}>
          <RefreshCw className={models.isFetching ? "animate-spin" : undefined} />
          Refresh
        </Button>
      }
    >
      {info ? (
        <p className="text-body text-muted-foreground">
          Active <strong className="font-mono text-primary">{info.folder}</strong> on {info.device} ·
          max length {info.max_len} · temperature {fixed(info.temperature, 3)}
        </p>
      ) : (
        <p className="text-body text-text-3">No model loaded.</p>
      )}
      <ErrorAlert error={models.error ?? load.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Folder</TableHead>
            <TableHead>Base</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {models.data?.map((model) => (
            <TableRow key={model.folder} className={cn(model.active && "bg-brand-tint/60")}>
              <TableCell className="font-mono text-foreground">{model.folder}</TableCell>
              <TableCell className="text-muted-foreground">{String(model.config?.base ?? "–")}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(model.mtime)}</TableCell>
              <TableCell>
                {model.active ? (
                  <Badge variant="success">
                    <CircleCheck />
                    active
                  </Badge>
                ) : model.complete ? (
                  <Badge variant="muted">ready</Badge>
                ) : (
                  <Badge variant="warning">incomplete</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!model.complete || load.isPending}
                  onClick={() => onLoad(model.folder)}
                >
                  <Upload />
                  {load.isPending && load.variables === model.folder ? "Loading..." : "Load"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {models.data?.length === 0 && (
        <p className="text-body text-text-3">No model folders found. Train one first.</p>
      )}
    </SectionCard>
  );
}
