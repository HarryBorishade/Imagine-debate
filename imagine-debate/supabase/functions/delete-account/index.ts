import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// Deletes the CALLER's own account and nothing else. The user id is always
// resolved server-side from their own verified session token — it is never
// read from the request body — so this can't be used to delete someone
// else's account no matter what a client sends.
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

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  try {
    // Resolve identity using the CALLER's own token against the public
    // (anon-key) client — this verifies the token and tells us who they
    // are without granting any elevated privilege.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } =
      await callerClient.auth.getUser();

    if (userError || !userData.user) {
      return jsonResponse({ error: "Invalid or expired session." }, 401);
    }

    const callerId = userData.user.id;

    // Only the admin (service-role) client can delete an auth user. It is
    // used exclusively with the id we just resolved above — never with any
    // id supplied by the request.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(callerId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while deleting the account.";

    console.error("delete-account error:", message);

    return jsonResponse({ error: message }, 500);
  }
});
