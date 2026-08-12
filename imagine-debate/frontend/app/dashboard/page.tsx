"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

type HistoryRange = 7 | 30;

interface Debate {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  time_per_turn?: number | null;
}

interface Profile {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

interface SessionUser {
  id: string;
  email?: string;
  user_metadata?: { username?: string };
}

interface UserStats {
  totalDebates: number;
  activeDebates: number;
  completedDebates: number;
  waitingDebates: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [debates, setDebates] = useState<Debate[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [historyRange, setHistoryRange] = useState<HistoryRange>(7);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/auth/login");
        return;
      }

      setUser(session.user);
      setLoading(false);
    }

    checkAuth();
  }, [router]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("rating, wins, losses, draws")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (!error && data) {
        setProfile(data as Profile);
      }

      setProfileLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;

    async function loadDebates() {
      setHistoryLoading(true);
      setHistoryError("");

      const since = new Date();
      since.setDate(since.getDate() - historyRange);

      // Include debates the user took part in, not just ones they created —
      // otherwise every debate joined via a shared code silently vanishes
      // from history the moment it starts.
      const { data, error } = await supabase
        .from("debates")
        .select("id, topic, status, created_at, time_per_turn")
        .or(
          `created_by.eq.${userId},for_player_id.eq.${userId},against_player_id.eq.${userId}`
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setDebates([]);
        setHistoryError(error.message || "Could not load your debate history.");
        setHistoryLoading(false);
        return;
      }

      setDebates((data || []) as Debate[]);
      setHistoryLoading(false);
    }

    loadDebates();

    return () => {
      cancelled = true;
    };
  }, [historyRange, user?.id]);

  const activeDebates = useMemo(
    () => debates.filter((debate) => debate.status !== "completed"),
    [debates]
  );

  const previousDebates = debates;

  const stats: UserStats = useMemo(
    () => ({
      totalDebates: debates.length,
      activeDebates: activeDebates.length,
      completedDebates: debates.filter((debate) => debate.status === "completed")
        .length,
      waitingDebates: debates.filter((debate) => debate.status === "waiting")
        .length,
    }),
    [activeDebates.length, debates]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-accent animate-spin" />
      </div>
    );
  }

  const displayName = user?.user_metadata?.username || "Debater";
  const totalGames = profile ? profile.wins + profile.losses + profile.draws : 0;
  const winRate =
    profile && totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : null;

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="eyebrow">
              Imagine Debate
            </Link>
            <h1 className="mt-3 font-serif text-3xl tracking-tight text-[#fffaf0]">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted">
              Welcome back, {displayName}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              className="border border-line px-4 py-2 text-sm font-semibold text-[#d7d0c2] transition-colors hover:bg-white/8"
            >
              Home
            </Link>
            <Link
              href="/settings"
              className="border border-line px-4 py-2 text-sm font-semibold text-[#d7d0c2] transition-colors hover:bg-white/8"
            >
              Settings
            </Link>
            <Link
              href="/debate/create"
              className="bg-cream px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white"
            >
              New debate
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-serif text-lg text-[#fffaf0]">
                Active debates
              </h2>
              <span className="dossier-index">
                {activeDebates.length} open
              </span>
            </div>

            {historyLoading ? (
              <LoadingRows />
            ) : activeDebates.length === 0 ? (
              <div className="px-5 py-10">
                <p className="text-sm text-muted">
                  No active debates in the selected window. Start a room and
                  share the four-digit code with an opponent.
                </p>
                <Link
                  href="/debate/create"
                  className="mt-5 inline-flex bg-accent px-4 py-2 text-sm font-semibold text-[#111411] hover:bg-accent-strong"
                >
                  Start a debate
                </Link>
              </div>
            ) : (
              <DebateList debates={activeDebates} />
            )}
          </section>

          <section className="border border-line bg-surface">
            <div className="flex flex-col gap-4 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-lg text-[#fffaf0]">
                  Previous debates
                </h2>
                <p className="mt-1 text-sm text-muted-2">
                  Supabase keeps this history for 30 days.
                </p>
              </div>

              <div className="inline-flex w-fit border border-line bg-black/10">
                {[7, 30].map((range) => (
                  <button
                    key={range}
                    onClick={() => setHistoryRange(range as HistoryRange)}
                    className={`px-3 py-2 text-sm font-semibold transition ${
                      historyRange === range
                        ? "bg-accent text-[#111411]"
                        : "text-[#c7c0b3] hover:bg-white/8"
                    }`}
                  >
                    Last {range} days
                  </button>
                ))}
              </div>
            </div>

            {historyError ? (
              <p className="px-5 py-8 text-sm text-rose-300">{historyError}</p>
            ) : historyLoading ? (
              <LoadingRows />
            ) : previousDebates.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">
                No debates found in the last {historyRange} days.
              </p>
            ) : (
              <DebateList debates={previousDebates} />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border-t-2 border-accent bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Rating</h2>
              {winRate !== null && (
                <span className="text-xs font-semibold text-accent">
                  {winRate}% win rate
                </span>
              )}
            </div>

            {profileLoading ? (
              <div className="mt-4 h-10 w-24 animate-pulse bg-white/5" />
            ) : (
              <p className="mt-2 font-serif text-5xl tracking-tight text-[#fffaf0]">
                {profile?.rating ?? 1000}
              </p>
            )}

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
              <div>
                <p className="text-lg font-semibold text-emerald-300">
                  {profile?.wins ?? 0}
                </p>
                <p className="text-xs text-muted-2">Wins</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-rose-300">
                  {profile?.losses ?? 0}
                </p>
                <p className="text-xs text-muted-2">Losses</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#d7d0c2]">
                  {profile?.draws ?? 0}
                </p>
                <p className="text-xs text-muted-2">Draws</p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted-2">
              Every new debater starts at 1000. Ratings update automatically
              after each completed debate.
            </p>
          </section>

          <section className="border border-line bg-surface p-5">
            <h2 className="eyebrow">{historyRange}-day summary</h2>
            <div className="mt-5 space-y-3 text-sm">
              <StatRow label="Total debates" value={stats.totalDebates} />
              <StatRow
                label="Open rooms"
                value={stats.activeDebates}
                valueClass="text-accent"
              />
              <StatRow
                label="Waiting"
                value={stats.waitingDebates}
                valueClass="text-amber-300"
              />
              <div className="border-t border-line pt-3">
                <StatRow
                  label="Finished"
                  value={stats.completedDebates}
                  valueClass="text-[#fffaf0]"
                />
              </div>
            </div>
          </section>

          <section className="border border-line bg-surface p-5">
            <h2 className="eyebrow">Retention</h2>
            <p className="mt-4 text-sm leading-6 text-muted">
              Debate rows older than 30 days are expected to be deleted from
              Supabase, so the longest dashboard view is capped at 30 days.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function DebateList({ debates }: { debates: Debate[] }) {
  return (
    <div className="divide-y divide-line">
      {debates.map((debate) => (
        <Link
          key={debate.id}
          href={`/debate/${debate.id}/lobby`}
          className="block px-5 py-4 hover:bg-white/5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-[#fffaf0]">{debate.topic}</p>
              <p className="mt-1 text-sm text-muted-2">
                Room {debate.id} - {formatDate(debate.created_at)}
                {debate.time_per_turn ? ` - ${debate.time_per_turn}s turns` : ""}
              </p>
            </div>
            <StatusPill status={debate.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "completed"
      ? "text-[#c7c0b3]"
      : status === "active"
      ? "text-emerald-300"
      : "text-amber-300";

  const label = status === "completed" ? "finished" : status;

  return (
    <span
      className={`w-fit border-l-2 border-current pl-2 font-mono text-xs font-semibold uppercase tracking-wide ${style}`}
    >
      {label}
    </span>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3 px-5 py-6">
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-12 animate-pulse bg-white/5" />
      ))}
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClass = "text-[#fffaf0]",
}: {
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
