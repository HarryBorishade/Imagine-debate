export type DebateFormat = "classic_v1" | "open_exchange_v1";

/** Each stage has two speakers; the exchange and closing start with AGAINST. */
export function speakerIndex(format: DebateFormat, stage: number, speaker: number): number {
  return format === "open_exchange_v1" && stage > 0 ? 1 - speaker : speaker;
}
