import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 2000;
const REPORT_RECIPIENT = "debateimagine@gmail.com";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Reports the CALLER's own account as the reporter — never trusts a
// client-supplied reporter id — and only ever notifies the site owner.
// The debate the report is about is re-verified server-side (the caller
// must actually be a participant) before anything is saved or emailed.
serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) {
    return jsonResponse(
      {
        error:
          "The Edge Function is missing one or more required environment variables.",
      },
      500,
    );
  }

  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } =
    await callerClient.auth.getUser();

  if (callerError || !callerData.user) {
    return jsonResponse({ error: "Invalid or expired session." }, 401);
  }

  const callerId = callerData.user.id;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const requestBody = await request.json();

    const debateId =
      typeof requestBody?.debateId === "string" ||
      typeof requestBody?.debateId === "number"
        ? String(requestBody.debateId).trim()
        : "";

    const reason =
      typeof requestBody?.reason === "string" ? requestBody.reason.trim() : "";

    if (!debateId) {
      return jsonResponse({ error: "A valid debateId is required." }, 400);
    }

    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
      return jsonResponse(
        {
          error: `Reason must be between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.`,
        },
        400,
      );
    }

    const { data: debate, error: debateError } = await supabase
      .from("debates")
      .select("id, topic, created_by, for_player_id, against_player_id")
      .eq("id", debateId)
      .maybeSingle();

    if (debateError || !debate) {
      return jsonResponse({ error: "Debate not found.", debateId }, 404);
    }

    const isParticipant =
      callerId === debate.created_by ||
      callerId === debate.for_player_id ||
      callerId === debate.against_player_id;

    if (!isParticipant) {
      return jsonResponse(
        { error: "You are not a participant in this debate.", debateId },
        403,
      );
    }

    const reportedUserId =
      debate.for_player_id === callerId
        ? debate.against_player_id
        : debate.against_player_id === callerId
          ? debate.for_player_id
          : null;

    const participantIds = [callerId, reportedUserId].filter(
      (id): id is string => !!id,
    );

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", participantIds);

    const usernameById = new Map(
      (profileRows ?? []).map((row) => [row.id, row.username]),
    );
    const reporterUsername = usernameById.get(callerId) ?? "Unknown";
    const reportedUsername = reportedUserId
      ? usernameById.get(reportedUserId) ?? "Unknown"
      : "Unknown";

    const { data: insertedReport, error: insertError } = await supabase
      .from("reports")
      .insert({
        debate_id: debateId,
        reporter_id: callerId,
        reported_user_id: reportedUserId,
        reason,
      })
      .select("id, created_at")
      .single();

    if (insertError || !insertedReport) {
      throw new Error(insertError?.message ?? "Could not save the report.");
    }

    const emailHtml = `
      <h2>New debate report</h2>
      <p><strong>Report ID:</strong> ${insertedReport.id}</p>
      <p><strong>Debate:</strong> #${escapeHtml(debateId)} — ${escapeHtml(debate.topic ?? "Untitled")}</p>
      <p><strong>Reported by:</strong> ${escapeHtml(reporterUsername)} (${callerId})</p>
      <p><strong>Reported user:</strong> ${escapeHtml(reportedUsername)}${reportedUserId ? ` (${reportedUserId})` : ""}</p>
      <p><strong>Submitted at:</strong> ${insertedReport.created_at}</p>
      <p><strong>Reason:</strong></p>
      <p>${escapeHtml(reason).replace(/\n/g, "<br/>")}</p>
      <p>Look this up in the Supabase dashboard — table <code>debates</code>, id <code>${escapeHtml(debateId)}</code>; table <code>reports</code>, id <code>${insertedReport.id}</code>.</p>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Imagine Debate <onboarding@resend.dev>",
        to: REPORT_RECIPIENT,
        subject: `[Report] Debate #${debateId} — ${reporterUsername} reported ${reportedUsername}`,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorBody = await emailResponse.text();

      // The report row is already saved — a failed email is logged, not
      // thrown, so the reporter still sees success and the report is still
      // on record for later lookup even if the email never arrives.
      console.error(
        `Resend email failed for report ${insertedReport.id}:`,
        errorBody,
      );

      return jsonResponse({
        success: true,
        reportId: insertedReport.id,
        emailSent: false,
      });
    }

    return jsonResponse({
      success: true,
      reportId: insertedReport.id,
      emailSent: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while submitting the report.";

    console.error("submit-report error:", message);

    return jsonResponse({ error: message }, 500);
  }
});
