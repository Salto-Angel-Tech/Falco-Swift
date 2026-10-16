import { useEffect, useState } from "react";
import type { JobKind, Meta, ParamValue } from "../api/types";
import { useJobs, useMeta } from "./queries";

type Seed = (values: Record<string, ParamValue>, meta: Meta) => Record<string, ParamValue>;

/** Form values for a job kind, seeded from /api/meta defaults once they arrive. */
export function useParamValues(kind: JobKind, seed?: Seed) {
  const meta = useMeta();
  const [values, setValues] = useState<Record<string, ParamValue> | null>(null);

  useEffect(() => {
    if (meta.data && values === null) {
      const defaults = { ...meta.data.defaults[kind] };
      setValues(seed ? seed(defaults, meta.data) : defaults);
    }
  }, [meta.data, values, kind, seed]);

  const set = (key: string, value: ParamValue) =>
    setValues((current) => ({ ...(current ?? {}), [key]: value }));

  return { meta, values: values ?? {}, ready: values !== null, set, setValues };
}

/** The job to show on a page: the one just started, else the newest job of that kind. */
export function useJobTarget(kind: JobKind) {
  const jobs = useJobs();
  const [startedId, setStartedId] = useState<string | null>(null);
  const latest = jobs.data?.find((job) => job.kind === kind);
  return { jobId: startedId ?? latest?.id ?? null, setStartedId, jobs };
}
