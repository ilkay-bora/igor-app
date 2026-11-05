import { deleteProject, getProject, renameProject } from "@/lib/projects";
import { projectErrorResponse } from "@/lib/project-api";

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  try {
    return Response.json(await getProject(id));
  } catch (err) {
    return projectErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    if (typeof body.name !== "string") return Response.json({ error: "name gerekli" }, { status: 400 });
    return Response.json(await renameProject(id, body.name));
  } catch (err) {
    return projectErrorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteProject(id);
    return Response.json({ ok: true });
  } catch (err) {
    return projectErrorResponse(err);
  }
}
