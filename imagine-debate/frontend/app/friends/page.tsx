"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";

type Person = { user_id: string; handle: string };
type Connection = Person & { relationship: "friend" | "incoming" | "outgoing"; request_id: string };
type Invitation = { invite_id: string; handle: string; topic: string; created_at: string };

const button = "rounded-lg border border-line px-3 py-2 text-sm text-cream hover:bg-white/8 disabled:opacity-50";

export default function FriendsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [handle, setHandle] = useState("");
  const [ownHandle, setOwnHandle] = useState("");
  const [searchResult, setSearchResult] = useState<Person | null>(null);
  const [searched, setSearched] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [blocked, setBlocked] = useState<Person[]>([]);

  const refresh = useCallback(async () => {
    const [profile, people, invites, blocks] = await Promise.all([
      supabase.rpc("social_get_profile"), supabase.rpc("social_connections"),
      supabase.rpc("social_incoming_invites"), supabase.rpc("social_blocked_users"),
    ]);
    const failure = profile.error || people.error || invites.error || blocks.error;
    if (failure) throw new Error("Friends are unavailable. Please try again later.");
    setOwnHandle(profile.data?.[0]?.handle ?? "");
    setConnections((people.data ?? []) as Connection[]);
    setInvitations((invites.data ?? []) as Invitation[]);
    setBlocked((blocks.data ?? []) as Person[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace("/auth/login"); return; }
      try { await refresh(); } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Friends are unavailable."); }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [refresh, router]);

  async function action(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: rpcError } = await supabase.rpc(name, args);
      if (rpcError) throw rpcError;
      await refresh();
      setSearchResult(null); setSearched(false); setNotice(success);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not complete that action."); }
    finally { setBusy(false); }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setSearchResult(null); setSearched(false);
    try {
      const { data, error: rpcError } = await supabase.rpc("social_search", { p_handle: handle.trim() });
      if (rpcError) throw rpcError;
      setSearchResult(data?.[0] ?? null); setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Search is unavailable."); }
    finally { setBusy(false); }
  }

  async function openInvite(id: string) {
    setBusy(true); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("social_open_invite", { p_invite_id: id });
      if (rpcError) throw rpcError;
      if (typeof data !== "string" || !/^\d{4}$/.test(data)) throw new Error("Invitation is no longer available.");
      router.push(`/debate/${data}/lobby`);
    } catch (err) { setError(err instanceof Error ? err.message : "Invitation is unavailable."); setBusy(false); }
  }

  function block(person: Person) {
    if (window.confirm(`Block ${person.handle}? This removes your friendship and pending invitations and prevents new debates together. It does not end a debate already in progress.`)) {
      void action("social_block", { p_user_id: person.user_id }, "Player blocked.");
    }
  }

  const friends = connections.filter((person) => person.relationship === "friend");
  const incoming = connections.filter((person) => person.relationship === "incoming");
  const outgoing = connections.filter((person) => person.relationship === "outgoing");

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b border-line"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5"><Link href="/dashboard" className="font-serif text-lg">Imagine Debate</Link><Link href="/settings" className="text-sm text-accent hover:underline">Settings</Link></div></header>
      <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
        <div><p className="eyebrow">Your connections</p><h1 className="mt-3 font-serif text-3xl">Friends</h1><p className="mt-2 text-sm text-muted">Search for an exact public handle, accept requests and invite friends to a debate.</p></div>
        {error && <p role="alert" className="rounded-lg border border-against/30 bg-against/10 p-3 text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-cream">{notice}</p>}
        {loading ? <p className="text-muted">Loading friends...</p> : <>
          {!ownHandle && <p className="rounded-lg border border-line p-4 text-sm text-muted">First choose a public handle in <Link href="/settings" className="text-accent underline">settings</Link>. Discovery is optional and off by default.</p>}
          <section className="card-panel space-y-4 p-5"><h2 className="font-serif text-xl">Find a player</h2>
            <form onSubmit={search} className="flex flex-wrap gap-2"><label htmlFor="friend-search" className="sr-only">Exact public handle</label><input id="friend-search" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={20} placeholder="Exact public handle" className="min-w-0 flex-1 rounded-lg border border-line bg-black/20 px-3 py-2 text-sm" /><button disabled={busy || !ownHandle || !/^[A-Za-z0-9_]{3,20}$/.test(handle.trim())} className={button}>Search</button></form>
            <p className="text-xs text-muted-2">Only players who have opted into discovery can be found. Search is limited to reduce abuse.</p>
            {searched && !searchResult && <p className="text-sm text-muted">No player found for that handle.</p>}
            {searchResult && <div className="flex flex-wrap items-center gap-2"><span className="mr-auto text-sm">@{searchResult.handle}</span><button disabled={busy} onClick={() => action("social_request_friend", { p_user_id: searchResult.user_id }, "Friend request sent if available.")} className={button}>Send request</button><button disabled={busy} onClick={() => block(searchResult)} className={button}>Block</button></div>}
          </section>
          <section className="card-panel space-y-3 p-5"><h2 className="font-serif text-xl">Invitations</h2>{invitations.length === 0 && <p className="text-sm text-muted">No waiting invitations. Refresh this page to check for new ones.</p>}{invitations.map((invite) => <div key={invite.invite_id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-sm">@{invite.handle}: {invite.topic}</span><button disabled={busy} onClick={() => openInvite(invite.invite_id)} className={button}>Join debate</button><button disabled={busy} onClick={() => action("social_dismiss_invite", { p_invite_id: invite.invite_id }, "Invitation dismissed.")} className={button}>Dismiss</button></div>)}</section>
          <section className="card-panel space-y-3 p-5"><h2 className="font-serif text-xl">Friend requests</h2>{incoming.length === 0 && outgoing.length === 0 && <p className="text-sm text-muted">No pending requests.</p>}{incoming.map((person) => <div key={person.request_id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-sm">@{person.handle} wants to connect</span><button disabled={busy} onClick={() => action("social_respond_friend", { p_request_id: person.request_id, p_accept: true }, "Friend request accepted.")} className={button}>Accept</button><button disabled={busy} onClick={() => action("social_respond_friend", { p_request_id: person.request_id, p_accept: false }, "Request declined.")} className={button}>Decline</button><button disabled={busy} onClick={() => block(person)} className={button}>Block</button></div>)}{outgoing.map((person) => <div key={person.request_id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-sm">@{person.handle} - request sent</span><button disabled={busy} onClick={() => action("social_remove_friend", { p_user_id: person.user_id }, "Request cancelled.")} className={button}>Cancel</button></div>)}</section>
          <section className="card-panel space-y-3 p-5"><h2 className="font-serif text-xl">Friends</h2>{friends.length === 0 && <p className="text-sm text-muted">No friends yet.</p>}{friends.map((person) => <div key={person.user_id} className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-sm">@{person.handle}</span><Link href={`/debate/create?invite=${encodeURIComponent(person.user_id)}`} className={button}>Invite to debate</Link><button disabled={busy} onClick={() => action("social_remove_friend", { p_user_id: person.user_id }, "Friend removed.")} className={button}>Remove</button><button disabled={busy} onClick={() => block(person)} className={button}>Block</button></div>)}</section>
          <section className="card-panel space-y-3 p-5"><h2 className="font-serif text-xl">Blocked players</h2>{blocked.length === 0 && <p className="text-sm text-muted">No blocked players.</p>}{blocked.map((person) => <div key={person.user_id} className="flex items-center gap-2 border-t border-line pt-3"><span className="mr-auto text-sm">@{person.handle}</span><button disabled={busy} onClick={() => action("social_unblock", { p_user_id: person.user_id }, "Player unblocked. Previous friendships are not restored.")} className={button}>Unblock</button></div>)}</section>
        </>}
      </main>
    </div>
  );
}
