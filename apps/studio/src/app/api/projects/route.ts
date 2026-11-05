import { createProject, listProjects } from "@/lib/projects";
import { projectErrorResponse } from "@/lib/project-api";

export async function GET() {
  return Response.json(await listProjects());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await createProject({ name: body.name, resolution: body.resolution }));
  } catch (err) {
    return projectErrorResponse(err);
  }
}
