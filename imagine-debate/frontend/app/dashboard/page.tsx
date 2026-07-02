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

interface UserStats {
  totalDebates: number;
  activeDebates: number;
  completedDebates: number;
  waitingDebates: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [debates, setDebates] = useState<Debate[]>([]);
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
    if (!user?.id) return;

    let cancelled = false;

    async function loadDebates() {
      setHistoryLoading(true);
      setHistoryError("");

      const since = new Date();
      since.setDate(since.getDate() - historyRange);

      const { data, error } = await supabase
        .from("debates")
        .select("id, topic, status, created_at, time_per_turn")
        .eq("created_by", user.id)
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
    () => debates.filter((debate) => debate.status !== "finished"),
    [debates]
  );

  const previousDebates = debates;

  const stats: UserStats = useMemo(
    () => ({
      totalDebates: debates.length,
      activeDebates: activeDebates.length,
      completedDebates: debates.filter((debate) => debate.status === "finished")
        .length,
      waitingDebates: debates.filter((debate) => debate.status === "waiting")
        .length,
    }),
    [activeDebates.length, debates]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101214]">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-emerald-300 animate-spin" />
      </div>
    );
  }

  const displayName = user?.user_metadata?.username || "Debater";

  return (
    <div className="min-h-screen bg-[#101214] text-[#f4f1ea]">
      <header className="border-b border-white/10 bg-[#101214]/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-emerald-300/80">
              Imagine Debate
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#fffaf0]">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-[#a9a295]">
              Welcome back, {displayName}
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-[#d7d0c2] hover:bg-white/8"
            >
              Home
            </Link>
            <Link
              href="/debate/create"
              className="rounded-md bg-[#f4f1ea] px-4 py-2 text-sm font-semibold text-[#101214] hover:bg-white"
            >
              New debate
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="border border-white/10 bg-[#171a1d]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-[#fffaf0]">
                Active debates
              </h2>
              <span className="text-xs text-[#8f887c]">
                {activeDebates.length} open
              </span>
            </div>

            {historyLoading ? (
              <LoadingRows />
            ) : activeDebates.length === 0 ? (
              <div className="px-5 py-10">
                <p className="text-sm text-[#a9a295]">
                  No active debates in the selected window. Start a room and
                  share the four-digit code with an opponent.
                </p>
                <Link
                  href="/debate/create"
                  className="mt-5 inline-flex rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-[#111411] hover:bg-emerald-200"
                >
                  Start a debate
                </Link>
              </div>
            ) : (
              <DebateList debates={activeDebates} />
            )}
          </section>

          <section className="border border-white/10 bg-[#171a1d]">
            <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#fffaf0]">
                  Previous debates
                </h2>
                <p className="mt-1 text-sm text-[#8f887c]">
                  Supabase keeps this history for 30 days.
                </p>
              </div>

              <div className="inline-flex w-fit overflow-hidden rounded-md border border-white/10 bg-black/10">
                {[7, 30].map((range) => (
                  <button
                    key={range}
                    onClick={() => setHistoryRange(range as HistoryRange)}
                    className={`px-3 py-2 text-sm font-semibold transition ${
                      historyRange === range
                        ? "bg-emerald-300 text-[#111411]"
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
              <p className="px-5 py-8 text-sm text-[#a9a295]">
                No debates found in the last {historyRange} days.
              </p>
            ) : (
              <DebateList debates={previousDebates} />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-white/10 bg-[#171a1d] p-5">
            <h2 className="text-base font-semibold text-[#fffaf0]">
              {historyRange}-day summary
            </h2>
            <div className="mt-5 space-y-3 text-sm">
              <StatRow label="Total debates" value={stats.totalDebates} />
              <StatRow
                label="Open rooms"
                value={stats.activeDebates}
                valueClass="text-emerald-300"
              />
              <StatRow
                label="Waiting"
                value={stats.waitingDebates}
                valueClass="text-amber-300"
              />
              <div className="border-t border-white/10 pt-3">
                <StatRow
                  label="Finished"
                  value={stats.completedDebates}
                  valueClass="text-[#fffaf0]"
                />
              </div>
            </div>
          </section>

          <section className="border border-white/10 bg-[#171a1d] p-5">
            <h2 className="text-base font-semibold text-[#fffaf0]">
              Retention
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#a9a295]">
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
    <div className="divide-y divide-white/10">
      {debates.map((debate) => (
        <Link
          key={debate.id}
          href={`/debate/${debate.id}/lobby`}
          className="block px-5 py-4 hover:bg-white/5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium text-[#fffaf0]">{debate.topic}</p>
              <p className="mt-1 text-sm text-[#9f988c]">
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
    status === "finished"
      ? "border-white/15 bg-white/8 text-[#c7c0b3]"
      : status === "active"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-300"
      : "border-amber-300/25 bg-amber-300/10 text-amber-300";

  return (
    <span
      className={`w-fit rounded border px-2 py-1 text-xs font-semibold capitalize ${style}`}
    >
      {status}
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
      <span className="text-[#a9a295]">{label}</span>
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
