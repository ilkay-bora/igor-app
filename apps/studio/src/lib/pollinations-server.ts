export async function runPollinationsGeneration(params: {
  prompt: string;
  width: number;
  height: number;
  seed?: string;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const seed = params.seed ?? String(Date.now());
  // model=flux is always free/unlimited on Pollinations, unlike other models
  // that draw from the (limited) Pollen credit balance.
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(params.prompt)}?width=${params.width}&height=${params.height}&nologo=true&seed=${seed}&model=flux`;

  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pollinations hatası (${res.status}): ${text.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
}
