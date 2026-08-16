import { supabase } from "@/supabaseClient";

export interface Message {
  id?: number;
  debateId?: number;
  userId?: string;
  username?: string;
  side?: "for" | "against" | null;
  argumentPart?: string;
  argumentPartLabel?: string;
  stageIndex?: number;
  turnIndex?: number;
  content: string;
  timestamp?: string;
  system?: boolean;
}

// Loads the full transcript for a debate. Used by the room page on
// reconnect (page refresh, tab resume on mobile, etc.) so a player never
// loses history that scrolled past before their browser dropped the socket
// connection, and by the outcome page to show the finished transcript
// alongside the AI verdict. RLS scopes this to debate participants only, so
// it's safe to call with the public client.
export async function fetchMessageHistory(debateId: string): Promise<Message[]> {
  const numericDebateId = Number(debateId);
  if (!Number.isSafeInteger(numericDebateId)) return [];

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, debate_id, sender_id, sender_username, side, argument_part, stage_index, turn_index, content, created_at"
    )
    .eq("debate_id", numericDebateId)
    .order("turn_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    debateId: row.debate_id,
    userId: row.sender_id,
    username: row.sender_username,
    side: row.side,
    argumentPart: row.argument_part,
    stageIndex: row.stage_index,
    turnIndex: row.turn_index,
    content: row.content,
    timestamp: row.created_at,
  }));
}
