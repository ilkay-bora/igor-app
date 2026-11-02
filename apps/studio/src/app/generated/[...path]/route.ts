import { serveMedia } from "@/lib/serve-media";

export async function GET(request: Request, ctx: RouteContext<"/generated/[...path]">) {
  const { path } = await ctx.params;
  return serveMedia("generated", path, request);
}
