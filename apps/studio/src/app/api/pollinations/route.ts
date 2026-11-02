import { runPollinationsGeneration } from "@/lib/pollinations-server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt");
  const width = Number(searchParams.get("width") ?? "1024");
  const height = Number(searchParams.get("height") ?? "1024");
  const seed = searchParams.get("seed") ?? undefined;

  if (!prompt) {
    return Response.json({ error: "prompt gerekli" }, { status: 400 });
  }

  try {
    const { buffer, contentType } = await runPollinationsGeneration({ prompt, width, height, seed });
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
