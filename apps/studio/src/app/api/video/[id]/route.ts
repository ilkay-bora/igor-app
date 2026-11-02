import { deleteJob } from "@/lib/video-jobs";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/video/[id]">
) {
  const { id } = await ctx.params;
  await deleteJob(id);
  return Response.json({ ok: true });
}
