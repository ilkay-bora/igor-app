import { comfyStatus, ensureComfyRunning, stopComfy } from "@/lib/comfy-launcher";
import { toErrorMessage } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { action } = (await request.json()) as { action: "start" | "stop" };
  try {
    if (action === "start") await ensureComfyRunning();
    else await stopComfy();
    return Response.json(await comfyStatus());
  } catch (err) {
    return Response.json({ ...(await comfyStatus()), error: toErrorMessage(err) }, { status: 500 });
  }
}
