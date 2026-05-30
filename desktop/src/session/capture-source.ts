export interface WindowCaptureSource {
  id: string;
}

export function findAuthorizedWindowSource<T extends WindowCaptureSource>(
  sources: T[],
  authoritativeSourceId: string
): T | null {
  const exactMatch = sources.find((candidate) => candidate.id === authoritativeSourceId);
  if (exactMatch) {
    return exactMatch;
  }
  const windowId = authoritativeSourceId.split(":")[1];
  if (!windowId) {
    return null;
  }
  return sources.find((candidate) => candidate.id.split(":")[1] === windowId) ?? null;
}
