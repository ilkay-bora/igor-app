import { enqueueJob, getJobs } from "@/lib/video-jobs";

export async function GET() {
  return Response.json(await getJobs());
}

export async function POST(request: Request) {
  const {
    prompt,
    width = 1280,
    height = 720,
    durationSeconds = 5,
    fps = 25,
    useStartImage = false,
    startImageDataUrl,
    startImageSteps,
    startImageProvider,
    generateAudio = true,
    motionLevel,
    videoSeed,
  } = await request.json();

  if (!prompt) {
    return Response.json({ error: "prompt gerekli" }, { status: 400 });
  }

  const job = await enqueueJob({
    prompt,
    width,
    height,
    durationSeconds,
    fps,
    useStartImage,
    startImageDataUrl,
    startImageSteps,
    startImageProvider,
    generateAudio,
    motionLevel,
    videoSeed,
  });
  return Response.json(job);
}
