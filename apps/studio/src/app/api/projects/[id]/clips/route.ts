import { addClip, removeClip, summarize } from "@/lib/projects";
import { projectErrorResponse } from "@/lib/project-api";

export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/clips">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  try {
    if (typeof body.sourceUrl !== "string") return Response.json({ error: "sourceUrl gerekli" }, { status: 400 });
    const { project, clip } = await addClip(id, body);
    return Response.json({ clip, project: summarize(project) });
  } catch (err) {
    return projectErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/projects/[id]/clips">) {
  const { id } = await ctx.params;
  const key = new URL(request.url).searchParams.get("key");
  try {
    if (!key) return Response.json({ error: "key gerekli" }, { status: 400 });
    return Response.json(summarize(await removeClip(id, key)));
  } catch (err) {
    return projectErrorResponse(err);
  }
}
