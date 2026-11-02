import { deleteProject } from "@/lib/video-projects";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/video-projects/[id]">
) {
  const { id } = await ctx.params;
  await deleteProject(id);
  return Response.json({ ok: true });
}
