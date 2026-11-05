// Prints a one-click sign-in link when the studio runs without the desktop
// shell (which signs the window in itself). The Node-only import has to sit
// lexically inside the NEXT_RUNTIME check, or it ends up in the Edge bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.IGOR_DESKTOP) return;
    const { getAppToken } = await import("./lib/local-token");
    const port = process.env.PORT || "3000";
    console.log(`\n  IGOR sign-in: http://localhost:${port}/login?token=${getAppToken()}\n`);
  }
}
