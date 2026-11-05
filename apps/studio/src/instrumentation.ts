// Server start hooks. Node-only imports have to sit lexically inside the
// NEXT_RUNTIME check, or they end up in the Edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startComfyIdleWatcher, stopComfy } = await import("./lib/comfy-launcher");
    startComfyIdleWatcher();

    if (process.env.IGOR_DESKTOP) {
      // If the desktop shell dies without stopping us (crash, killed from
      // Task Manager), don't linger as an orphan holding ComfyUI.
      const parent = Number(process.env.IGOR_PARENT_PID);
      if (parent) {
        setInterval(async () => {
          try {
            process.kill(parent, 0);
          } catch {
            await stopComfy().catch(() => undefined);
            process.exit(0);
          }
        }, 5000).unref();
      }
      return;
    }

    // Standalone (no desktop shell): print a one-click sign-in link.
    const { getAppToken } = await import("./lib/local-token");
    const port = process.env.PORT || "3000";
    console.log(`\n  IGOR sign-in: http://localhost:${port}/login?token=${getAppToken()}\n`);
  }
}
