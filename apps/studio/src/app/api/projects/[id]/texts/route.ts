import { addText, summarize } from "@/lib/projects";
import { projectErrorResponse } from "@/lib/project-api";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/texts">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    const { project, overlay } = await addText(id, body);
    return Response.json({ overlay, project: summarize(project) });
  } catch (err) {
    return projectErrorResponse(err);
  }
}
