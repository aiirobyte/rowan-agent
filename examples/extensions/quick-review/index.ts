export async function run(context: import("@rowan-agent/agent").PhaseContext) {
  const payload = context.state.payload as { files?: string[] } | undefined;
  const files = payload?.files ?? [];
  if (files.length === 0) return { message: "No files to review", route: "stop" };
  return {
    message: `Reviewed ${files.length} files`,
    route: "stop",
    payload: { reviewed: files.length },
  };
}
