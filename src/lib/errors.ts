/** Turn low-level errors into something a learner can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // fetch() throws TypeError ("Failed to fetch" / "NetworkError") when the local server isn't running.
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return "SamjhaDo ka server band hai. Desktop pe SamjhaDo.cmd dobara chalao, phir try karo.";
  }
  return msg;
}
