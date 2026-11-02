import { deleteVoiceClip } from "@/lib/tts-server";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/voices/[id]">
) {
  const { id } = await ctx.params;
  await deleteVoiceClip(id);
  return Response.json({ ok: true });
}
