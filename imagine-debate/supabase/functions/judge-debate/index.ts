import { createClient } from "@supabase/supabase-js";


type DebateSide = "for" | "against" | "draw";

interface DebateMessage {
  side: string | null;
  content: string | null;
  sender_username: string | null;
  argument_part: string | null;
  created_at?: string | null;
  stage_index?: number | null;
  turn_index?: number | null;
}

interface JudgeScore {
  logic: number;
  evidence: number;
  rebuttal: number;
  clarity: number;
  conduct: number;
  total: number;
}

interface JudgeResponse {
  winner: DebateSide;
  confidence?: number;
  scores: {
    for: JudgeScore;
    against: JudgeScore;
  };
  summary?: string;
  feedback_for?: string;
  feedback_against?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const body = await req.json().catch(() => null);

    if (!body || !body.debate_id) {
      return json({ error: "Missing debate_id" }, 400);
    }

    const debateId = String(body.debate_id);

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ??
      "https://nxieymemspsauodknwld.supabase.co";

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!serviceRoleKey || !geminiApiKey) {
      return json(
        {
          error: "Missing environment variables",
          missing: {
            SUPABASE_SERVICE_ROLE_KEY: !serviceRoleKey,
            GEMINI_API_KEY: !geminiApiKey,
          },
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Check if this debate has already been judged
    const { data: existingJudgement, error: existingError } = await supabase
      .from("debate_judgements")
      .select("*")
      .eq("debate_id", debateId)
      .maybeSingle();

    if (existingError) {
      return json({ error: existingError.message }, 500);
    }

    if (existingJudgement) {
      return json({
        message: "Judgement already exists",
        judgement: existingJudgement,
      });
    }

    // 2. Fetch debate topic
    const { data: debate, error: debateError } = await supabase
      .from("debates")
      .select("id, topic")
      .eq("id", debateId)
      .single();

    if (debateError || !debate) {
      return json(
        {
          error: "Debate not found",
          details: debateError?.message,
        },
        404,
      );
    }

    // 3. Fetch messages for this debate
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select(
        "side, content, created_at, sender_username, argument_part, stage_index, turn_index",
      )
      .eq("debate_id", debateId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return json({ error: messagesError.message }, 500);
    }

    if (!messages || messages.length < 2) {
      return json({ error: "Not enough messages to judge" }, 400);
    }

    // 4. Build transcript
    const transcript = (messages as DebateMessage[])
      .map((message, index) => {
        const side = String(message.side || "unknown").toUpperCase();
        const username = String(message.sender_username || "Unknown user");
        const argumentPart = message.argument_part
          ? ` [${message.argument_part}]`
          : "";
        const content = String(message.content || "").trim();

        return `${index + 1}. ${side}${argumentPart} - ${username}: ${content}`;
      })
      .join("\n");

    const prompt = buildJudgePrompt(String(debate.topic || ""), transcript);

    // 5. Call Gemini
    const model = "gemini-2.5-flash-lite";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();

      return json(
        {
          error: "Gemini API error",
          details: errorText,
        },
        500,
      );
    }

    const geminiData = (await geminiResponse.json()) as GeminiResponse;
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return json({ error: "No judgement returned by Gemini" }, 500);
    }

    let judgement: JudgeResponse;

    try {
      judgement = JSON.parse(rawText) as JudgeResponse;
    } catch {
      return json(
        {
          error: "Gemini returned invalid JSON",
          raw: rawText,
        },
        500,
      );
    }

    if (!isValidWinner(judgement.winner)) {
      return json(
        {
          error: "Invalid winner returned by AI",
          judgement,
        },
        500,
      );
    }

    if (!judgement.scores?.for || !judgement.scores?.against) {
      return json(
        {
          error: "AI response is missing score data",
          judgement,
        },
        500,
      );
    }

    // 6. Estimate token usage and cost
    const inputTokens = geminiData.usageMetadata?.promptTokenCount ?? null;
    const outputTokens =
      geminiData.usageMetadata?.candidatesTokenCount ?? null;

    const estimatedCostUsd = estimateGeminiFlashLiteCost(
      inputTokens,
      outputTokens,
    );

    // 7. Save judgement
    const { data: savedJudgement, error: insertError } = await supabase
      .from("debate_judgements")
      .insert({
        debate_id: debateId,
        provider: "google",
        model,
        winner: judgement.winner,
        confidence: Number(judgement.confidence ?? 0),
        scores: judgement.scores,
        summary: String(judgement.summary ?? ""),
        feedback_for: String(judgement.feedback_for ?? ""),
        feedback_against: String(judgement.feedback_against ?? ""),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: estimatedCostUsd,
      })
      .select("*")
      .single();

    if (insertError) {
      return json({ error: insertError.message }, 500);
    }

    return json({
      message: "Judgement created successfully",
      judgement: savedJudgement,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

function buildJudgePrompt(topic: string, transcript: string) {
  return `
You are the neutral AI judge for Imagine Debate.

Debate topic:
${topic}

Debate transcript:
${transcript}

Judge only based on the transcript.
Do not judge based on your personal opinion about the topic.
Do not favour either side unfairly.
Reward clear logic, relevant evidence, direct rebuttals, clarity, and respectful conduct.

Score each side out of 10 for:
- logic
- evidence
- rebuttal
- clarity
- conduct

Then calculate a total out of 50.

The winner value must be exactly one of:
"for", "against", or "draw".

Return only valid JSON.
Do not include markdown.
Do not include text outside the JSON.

Required JSON format:
{
  "winner": "for",
  "confidence": 0.75,
  "scores": {
    "for": {
      "logic": 8,
      "evidence": 7,
      "rebuttal": 8,
      "clarity": 9,
      "conduct": 10,
      "total": 42
    },
    "against": {
      "logic": 7,
      "evidence": 6,
      "rebuttal": 7,
      "clarity": 8,
      "conduct": 10,
      "total": 38
    }
  },
  "summary": "Short neutral explanation of why the winner won or why it was a draw.",
  "feedback_for": "One useful improvement point for the for side.",
  "feedback_against": "One useful improvement point for the against side."
}
`;
}

function isValidWinner(winner: unknown): winner is DebateSide {
  return winner === "for" || winner === "against" || winner === "draw";
}

function estimateGeminiFlashLiteCost(
  inputTokens: number | null,
  outputTokens: number | null,
) {
  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  const inputCostPerMillion = 0.1;
  const outputCostPerMillion = 0.4;

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMillion;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMillion;

  return Number((inputCost + outputCost).toFixed(6));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}