import { enqueueEditorProject, getEditorProjects } from "@/lib/editor-projects";

export async function GET() {
  return Response.json(await getEditorProjects());
}

export async function POST(request: Request) {
  const {
    clips,
    width = 1280,
    height = 720,
    fps = 25,
    musicDataUrl,
    musicFilename,
    musicVolume = 0.5,
    voiceDataUrl,
    voiceFilename,
    voiceVolume = 1,
    voiceStartTime = 0,
    overlays = [],
    audioLayers = [],
    strips = [],
    imageLayers = [],
  } = await request.json();

  if (!Array.isArray(clips) || clips.length === 0) {
    return Response.json({ error: "En az 1 klip gerekli" }, { status: 400 });
  }

  try {
    const project = await enqueueEditorProject({
      clips,
      width,
      height,
      fps,
      musicDataUrl,
      musicFilename,
      musicVolume,
      voiceDataUrl,
      voiceFilename,
      voiceVolume,
      voiceStartTime,
      overlays,
      audioLayers,
      strips,
      imageLayers,
    });
    return Response.json(project);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
