import { serveMedia } from "@/lib/serve-media";

export async function GET(request: Request, ctx: RouteContext<"/videos/[...path]">) {
  const { path } = await ctx.params;
  return serveMedia("videos", path, request);
}
