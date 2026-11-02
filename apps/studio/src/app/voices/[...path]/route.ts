import { serveMedia } from "@/lib/serve-media";

export async function GET(request: Request, ctx: RouteContext<"/voices/[...path]">) {
  const { path } = await ctx.params;
  return serveMedia("voices", path, request);
}
