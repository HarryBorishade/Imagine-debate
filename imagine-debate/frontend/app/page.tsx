"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

interface User {
  id: string;
  email: string;
  user_metadata?: {
    username?: string;
  };
}

const FEATURED_DEBATES = [
  {
    id: "ai-finance",
    topic: "AI Should Regulate Finance",
    description: "Should artificial intelligence hold regulatory power over financial markets?",
    tags: ["Technology", "Economics"],
    difficulty: "Advanced",
  },
  {
    id: "remote-work",
    topic: "Remote Work is More Productive",
    description: "Does working from home outperform the traditional office for knowledge workers?",
    tags: ["Work", "Society"],
    difficulty: "Intermediate",
  },
  {
    id: "space-exploration",
    topic: "Space Exploration Benefits Humanity",
    description: "Are the costs of space programmes justified by the returns to society?",
    tags: ["Science", "Policy"],
    difficulty: "Intermediate",
  },
  {
    id: "universal-basic-income",
    topic: "Universal Basic Income Works",
    description: "Can a monthly unconditional payment to every citizen replace the welfare state?",
    tags: ["Economics", "Politics"],
    difficulty: "Advanced",
  },
  {
    id: "social-media-democracy",
    topic: "Social Media Harms Democracy",
    description: "Has the algorithmic feed done more damage than good to democratic discourse?",
    tags: ["Technology", "Politics"],
    difficulty: "Intermediate",
  },
  {
    id: "nuclear-energy",
    topic: "Nuclear Energy is the Future",
    description: "Is nuclear the safest, most scalable path to a carbon-neutral grid?",
    tags: ["Energy", "Climate"],
    difficulty: "Beginner",
  },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Beginner: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  Intermediate: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  Advanced: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function getUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) setUser(session.user as User);
      setLoading(false);
    }
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ? (session.user as User) : null);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleStartDebate = (topicId: string) => {
    if (!user) {
      router.push("/auth/signup");
      return;
    }
    router.push(`/debate/create?topic=${topicId}`);
  };

  const handleJoinDebate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push("/auth/signup");
      return;
    }
    const trimmed = joinCode.trim();
    if (!trimmed) {
      setJoinError("Please enter a room code.");
      return;
    }
    if (!/^\d{4}$/.test(trimmed)) {
      setJoinError("Code must be exactly 4 digits.");
      return;
    }
    router.push(`/debate/join?code=${trimmed}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = user?.user_metadata?.username || user?.email?.split("@")[0];

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 bg-[#0d1117]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-indigo-400">Imagine</span>
            <span className="text-white/60">·</span>
            <span>Debate</span>
          </span>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden sm:block text-sm text-white/50">
                  {displayName}
                </span>
                <Link
                  href="/dashboard"
                  className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-10">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-widest uppercase text-indigo-400 mb-4">
            AI-judged · real-time · structured
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
            Sharpen your
            <br />
            <span className="text-indigo-400">argument.</span>
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-xl">
            Pick a topic, face an opponent, and get detailed scoring from an AI judge.
            Every claim counts.
          </p>
        </div>

        {/* ── Action bar ── */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 max-w-2xl">
          {/* Start a debate */}
          <Link
            href={user ? "/debate/create" : "/auth/signup"}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Start a debate
          </Link>

          {/* Join by code */}
          <form onSubmit={handleJoinDebate} className="flex-1 flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={joinCode}
              onChange={(e) => {
                // Only allow digits, max 4
                const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                setJoinCode(val);
                setJoinError("");
              }}
              placeholder="4-digit code"
              maxLength={4}
              className="flex-1 px-4 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white placeholder-white/25 text-sm font-mono tracking-widest focus:outline-none focus:border-indigo-500 focus:bg-white/[0.07] transition-all"
            />
            <button
              type="submit"
              className="px-5 py-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.08] text-white text-sm font-medium transition-all whitespace-nowrap"
            >
              Join
            </button>
          </form>
        </div>
        {joinError && (
          <p className="mt-2 text-sm text-rose-400">{joinError}</p>
        )}

        {user && (
          <p className="mt-4 text-sm text-white/30">
            Signed in as <span className="text-white/50">{displayName}</span>
            {" · "}
            <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              view your debates →
            </Link>
          </p>
        )}
      </section>

      {/* ── How it works ── */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.06]">
          {[
            {
              step: "01",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              ),
              title: "Choose a topic",
              body: "Pick from our curated debates or propose your own motion.",
            },
            {
              step: "02",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              ),
              title: "Debate live",
              body: "Take turns presenting claims, evidence, and rebuttals in real time.",
            },
            {
              step: "03",
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              ),
              title: "Get scored",
              body: "The AI judge reviews every argument and delivers a verdict with detailed feedback.",
            },
          ].map(({ step, icon, title, body }) => (
            <div key={step} className="bg-[#0d1117] px-8 py-8 flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                {icon}
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-widest text-white/25 mb-1.5">{step}</p>
                <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Debate topics ── */}
      <section className="max-w-6xl mx-auto px-6 py-10 pb-24">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-xl font-semibold">Featured topics</h2>
          <Link
            href={user ? "/debate/create" : "/auth/signup"}
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Propose your own →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURED_DEBATES.map((debate) => (
            <div
              key={debate.id}
              className="group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/[0.055] hover:border-indigo-500/30 transition-all duration-200"
            >
              {/* Tags row */}
              <div className="flex items-center gap-2 flex-wrap">
                {debate.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/[0.06] text-white/40"
                  >
                    {tag}
                  </span>
                ))}
                <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-md ${DIFFICULTY_COLORS[debate.difficulty]}`}>
                  {debate.difficulty}
                </span>
              </div>

              {/* Topic */}
              <div className="flex-1">
                <h3 className="text-base font-semibold text-white leading-snug mb-2 group-hover:text-indigo-200 transition-colors">
                  {debate.topic}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  {debate.description}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  onClick={() => handleStartDebate(debate.id)}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                >
                  Start debate
                </button>
                {/* FIX: was /debate/join?topic=${debate.id} which passed a slug as a code */}
                <Link
                  href="/debate/join"
                  className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white text-xs font-medium transition-all"
                >
                  Join existing
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      {!user && (
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="relative rounded-2xl border border-indigo-500/20 bg-indigo-600/[0.07] px-8 py-12 text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.08)_0%,_transparent_70%)]" />
            <div className="relative">
              <h2 className="text-2xl font-bold mb-3">Ready to make your case?</h2>
              <p className="text-white/50 mb-6 max-w-md mx-auto text-sm leading-relaxed">
                Create a free account and jump into a debate in under two minutes.
              </p>
              <Link
                href="/auth/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all"
              >
                Create your account
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm font-medium">
            <span className="text-indigo-400">Imagine</span>
            <span className="text-white/30">·</span>
            <span className="text-white/30">Debate</span>
          </span>
          <p className="text-xs text-white/25">© 2026 Imagine-Debate. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}