# IGOR

**A local AI video editor that your agents can drive.** The agent drafts the edit, you polish it.

IGOR runs on your own GPU. It generates images, video clips and voiceovers with local models (via ComfyUI) or your own cloud API keys, and puts them on a timeline editor that renders to MP4 with ffmpeg. An MCP server (in progress) lets Claude Code, Cursor and other agents create and edit projects, which you then open in the same editor.

> Status: early development. The desktop app and MCP server are being built, see [docs/ROADMAP.md](docs/ROADMAP.md).

[Türkçe](#türkçe)

## Features

- **Timeline editor**: video and image clips, trimming, transitions, text overlays, lower thirds, music and voiceover tracks, MP4 export.
- **Image generation**: local FLUX (schnell / dev) through ComfyUI, or Gemini and Pollinations with your own key.
- **Video generation**: local LTX-2.3 image-to-video through ComfyUI, with a background job queue that survives restarts.
- **Character consistency**: one reference image and seed reused across scenes.
- **Text to speech**: Gemini TTS voices with style presets.
- **Tags**: group everything you make by project, client or channel.
- **UI language**: Turkish and English (English in progress).

## Requirements

- Windows 10/11 with an NVIDIA GPU (8 GB VRAM minimum, 12 GB+ recommended) and 32 GB RAM for video.
- Node.js 20+
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with the models you want to use. Models are not bundled; each has its own license (FLUX.1-dev and LTX-2 have non-commercial or revenue-limited terms, check them before commercial use).

## Getting started

```bash
git clone https://github.com/ilkay-bora/igor-app.git
cd igor-app
npm install
cp apps/studio/.env.example apps/studio/.env.local   # then edit it
npm run dev
```

Open http://localhost:3000 and log in with the `APP_TOKEN` you set.

## Project layout

```
apps/studio     Next.js app: UI and local API
docs/           Roadmap and design notes
```

Planned: `packages/core` (engine shared by UI, API and MCP), `packages/mcp` (MCP server), `apps/desktop` (Electron shell).

## License

MIT. Model weights you download are covered by their own licenses.

---

## Türkçe

**Agent'larının da kullanabildiği lokal bir AI video editörü.** Agent taslağı kurgular, sen cilalarsın.

IGOR kendi GPU'nda çalışır. Lokal modellerle (ComfyUI üzerinden) ya da kendi API anahtarlarınla görsel, video ve seslendirme üretir, bunları ffmpeg ile MP4'e render eden bir timeline editörüne koyar. Geliştirilmekte olan MCP sunucusu sayesinde Claude Code, Cursor gibi agent'lar proje kurup düzenleyebilir, sen de aynı projeyi editörde açıp düzeltirsin.

Kurulum için yukarıdaki "Getting started" adımlarını izle. Yol haritası: [docs/ROADMAP.md](docs/ROADMAP.md).
