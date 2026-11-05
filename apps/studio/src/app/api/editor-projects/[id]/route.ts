import { deleteEditorProject, getEditorProjects } from "@/lib/editor-projects";

export async function GET(_request: Request, ctx: RouteContext<"/api/editor-projects/[id]">) {
  const { id } = await ctx.params;
  const render = (await getEditorProjects()).find((p) => p.id === id);
  if (!render) return Response.json({ error: "Render bulunamadı" }, { status: 404 });
  return Response.json(render);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/editor-projects/[id]">
) {
  const { id } = await ctx.params;
  await deleteEditorProject(id);
  return Response.json({ ok: true });
}
