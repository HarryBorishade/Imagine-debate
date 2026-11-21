// Retain events received while the history request was in flight, without duplicates.
export function mergeMessageHistory<T extends { id?: number }>(history: T[], current: T[]): T[] {
  const currentIds = new Set(current.map((message) => message.id).filter((id) => id !== undefined));
  return [...history.filter((message) => message.id === undefined || !currentIds.has(message.id)), ...current];
}
