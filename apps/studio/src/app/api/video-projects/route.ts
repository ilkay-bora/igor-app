import { enqueueProject, getProjects } from "@/lib/video-projects";

export async function GET() {
  return Response.json(await getProjects());
}

export async function POST(request: Request) {
  const {
    width = 1280,
    height = 720,
    fps = 25,
    scenes,
    referenceImageDataUrl,
    referenceProvider,
    referenceDenoise,
    seed,
    videoSeed,
    motionLevel,
  } = await request.json();

  if (!Array.isArray(scenes) || scenes.length < 2) {
    return Response.json({ error: "En az 2 sahne gerekli" }, { status: 400 });
  }
  if (scenes.some((s) => !s.prompt || !String(s.prompt).trim())) {
    return Response.json({ error: "Her sahne için prompt gerekli" }, { status: 400 });
  }

  try {
    const project = await enqueueProject({
      width,
      height,
      fps,
      scenes,
      referenceImageDataUrl,
      referenceProvider,
      referenceDenoise,
      seed,
      videoSeed,
      motionLevel,
    });
    return Response.json(project);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
