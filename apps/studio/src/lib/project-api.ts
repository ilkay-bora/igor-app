import { ProjectError } from "@/lib/projects";

export function projectErrorResponse(err: unknown): Response {
  if (err instanceof ProjectError) return Response.json({ error: err.message }, { status: err.status });
  return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}
