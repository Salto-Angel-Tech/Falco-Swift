import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Job, JobKind, ParamValue, QuestionsMap } from "../api/types";

export const keys = {
  meta: ["meta"] as const,
  questions: (path: string) => ["questions", path] as const,
  data: (path: string) => ["data", path] as const,
  jobs: ["jobs"] as const,
  job: (id: string) => ["jobs", id] as const,
  models: ["models"] as const,
  activeModel: ["models", "active"] as const,
  cases: (dir: string) => ["cases", dir] as const,
};

const ACTIVE = ["queued", "running"];

export const isActive = (job: Pick<Job, "status">) => ACTIVE.includes(job.status);

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: api.meta, staleTime: Infinity });
}

export function useQuestions(path: string) {
  return useQuery({ queryKey: keys.questions(path), queryFn: () => api.questions(path), retry: false });
}

export function useSaveQuestions(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (questions: QuestionsMap) => api.saveQuestions(path, questions),
    onSuccess: (data) => client.setQueryData(keys.questions(path), data),
  });
}

export function useDataSummary(path: string) {
  return useQuery({ queryKey: keys.data(path), queryFn: () => api.data(path), enabled: !!path });
}

/** Job history; polls while any job is active so badges and warnings stay current. */
export function useJobs() {
  return useQuery({
    queryKey: keys.jobs,
    queryFn: api.jobs,
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 3000 : 15000),
  });
}

export function useRunningJob(kind: JobKind): Job | undefined {
  const jobs = useJobs();
  return jobs.data?.find((job) => job.kind === kind && isActive(job));
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: keys.job(id ?? ""),
    queryFn: () => api.job(id as string),
    enabled: !!id,
  });
}

export function useStartJob(kind: JobKind) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, ParamValue>) => api.startJob(kind, params),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}

export function useCancelJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.jobs }),
  });
}

export function useModels() {
  return useQuery({ queryKey: keys.models, queryFn: api.models });
}

export function useActiveModel() {
  return useQuery({ queryKey: keys.activeModel, queryFn: api.activeModel });
}

export function useLoadModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (folder: string) => api.loadModel(folder),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.models }),
  });
}

export function useDecide() {
  return useMutation({
    mutationFn: ({ state, questions }: { state: unknown; questions: QuestionsMap }) =>
      api.decide(state, questions),
  });
}

export function useCases(dir: string) {
  return useQuery({ queryKey: keys.cases(dir), queryFn: () => api.cases(dir) });
}

export function usePutCase(dir: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, id, state }: { name: string; id: string | null; state: unknown }) =>
      api.putCase(dir, name, { id, state }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cases(dir) }),
  });
}

export function useDeleteCase(dir: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteCase(dir, name),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cases(dir) }),
  });
}

export function useEvaluate() {
  return useMutation({
    mutationFn: ({ dir, questionsPath }: { dir: string; questionsPath: string }) =>
      api.evaluate(dir, questionsPath),
  });
}
