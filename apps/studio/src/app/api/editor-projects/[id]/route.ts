import { deleteEditorProject } from "@/lib/editor-projects";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/editor-projects/[id]">
) {
  const { id } = await ctx.params;
  await deleteEditorProject(id);
  return Response.json({ ok: true });
}
