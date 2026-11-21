// Visible only when this build explicitly points to a loopback Supabase API.
export function LocalAuthNotice() {
  let local = false;
  try {
    local = ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname
    );
  } catch { /* Missing configuration is handled by the Auth client. */ }
  if (!local) return null;

  return (
    <div className="mb-5 rounded-lg border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
      <p>This is the local test app. Create a new test account; production accounts are separate.</p>
      <p className="mt-2">
        Reset emails appear in the{" "}
        <a href="http://127.0.0.1:54324" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          local test inbox
        </a>{" "}
        instead of your normal mailbox.
      </p>
    </div>
  );
}
