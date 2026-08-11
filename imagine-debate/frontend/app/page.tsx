"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";

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
    topic: "AI should regulate financial markets",
    description:
      "Who should hold authority when automated systems can detect risk faster than humans?",
    tags: ["Technology", "Economics"],
    level: "Advanced",
  },
  {
    id: "remote-work",
    topic: "Remote work is more productive than office work",
    description:
      "A practical argument about focus, management, culture, and measurable output.",
    tags: ["Work", "Society"],
    level: "Intermediate",
  },
  {
    id: "space-exploration",
    topic: "Space exploration benefits humanity",
    description:
      "Do scientific returns justify the cost, risk, and political attention?",
    tags: ["Science", "Policy"],
    level: "Intermediate",
  },
  {
    id: "universal-basic-income",
    topic: "Universal basic income is feasible and effective",
    description:
      "A debate about welfare design, dignity, incentives, and public budgets.",
    tags: ["Economics", "Politics"],
    level: "Advanced",
  },
  {
    id: "social-media-democracy",
    topic: "Social media harms democracy",
    description:
      "Has the algorithmic feed made civic life better informed or more unstable?",
    tags: ["Technology", "Politics"],
    level: "Intermediate",
  },
  {
    id: "nuclear-energy",
    topic: "Nuclear energy is the future of clean power",
    description:
      "A clean-energy motion about risk, scale, cost, and public trust.",
    tags: ["Energy", "Climate"],
    level: "Beginner",
  },
];

const LEVEL_STYLES: Record<string, string> = {
  Beginner: "border-emerald-400/25 text-emerald-300 bg-emerald-400/10",
  Intermediate: "border-amber-400/25 text-amber-300 bg-amber-400/10",
  Advanced: "border-rose-400/25 text-rose-300 bg-rose-400/10",
};

const STEPS = [
  {
    title: "Create a motion",
    body: "Choose a topic, set the turn length, and share the four-digit room code.",
  },
  {
    title: "Take turns",
    body: "Argue for or against the motion in timed rounds, with the option to pass early.",
  },
  {
    title: "Get the verdict",
    body: "An impartial AI judge scores the transcript and updates your rating.",
  },
];

const FAQ_TEASER = [
  {
    q: "How is the winner decided?",
    a: "An AI judge scores logic, evidence, rebuttal, clarity, and conduct across the full transcript.",
  },
  {
    q: "What if my opponent leaves?",
    a: "They get a grace period to reconnect; if they don't return, you win by default.",
  },
  {
    q: "Is it free?",
    a: "Yes — creating rooms, debating, and receiving an AI outcome are all free.",
  },
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

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

  const displayName = user?.user_metadata?.username || "Debater";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleStartDebate = (topicId?: string) => {
    if (!user) {
      router.push("/auth/signup");
      return;
    }

    router.push(topicId ? `/debate/create?topic=${topicId}` : "/debate/create");
  };

  const handleJoinDebate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      router.push("/auth/signup");
      return;
    }

    const trimmed = joinCode.trim();

    if (!/^\d{4}$/.test(trimmed)) {
      setJoinError("Enter a valid four-digit room code.");
      return;
    }

    setJoining(true);
    setJoinError("");

    try {
      const { data, error } = await supabase.rpc("check_debate_code", {
        p_code: trimmed,
      });

      if (error) throw error;

      const match = data?.[0];

      if (!match) {
        setJoinError("No debate found with that code.");
        setJoining(false);
        return;
      }

      if (match.status === "completed") {
        setJoinError("That debate has already finished.");
        setJoining(false);
        return;
      }

      router.push(`/debate/${trimmed}/lobby`);
    } catch (err: unknown) {
      setJoinError(
        err instanceof Error ? err.message : "Could not join that debate."
      );
      setJoining(false);
    }
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.url}/debate/join?code={code}`,
      "query-input": "required name=code",
    },
  };

  return (
    <div className="min-h-screen bg-ink text-cream">
      <nav className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Imagine Debate
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/faq"
              className="hidden rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-white sm:block"
            >
              FAQ
            </Link>
            {loading ? (
              // Neutral placeholder while the session check is in flight —
              // avoids flashing "Sign in" then immediately swapping to the
              // signed-in state for returning users.
              <div className="h-9 w-24 animate-pulse rounded-md bg-white/5" />
            ) : user ? (
              <>
                <span className="hidden text-sm text-muted sm:block">
                  {displayName}
                </span>
                <Link
                  href="/dashboard"
                  className="rounded-md px-3 py-2 text-sm text-[#d7d0c2] transition-colors hover:bg-white/8 hover:text-white"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-md px-3 py-2 text-sm text-muted-2 transition-colors hover:bg-white/8 hover:text-white"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-md px-3 py-2 text-sm text-[#c7c0b3] transition-colors hover:bg-white/8 hover:text-white"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="rounded-md bg-cream px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main id="main-content" className="pb-24 sm:pb-0">
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-14 lg:grid-cols-[1fr_430px] lg:items-end lg:pt-20">
          <div>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.28em] text-accent/80">
              Timed arguments for sharper thinking
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight text-[#fffaf0] sm:text-6xl">
              Debate without the noise.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              Create a motion, invite an opponent, and make your case in a
              structured room built for clear claims and clean rebuttals — then
              get an impartial verdict.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => handleStartDebate()}
                className="rounded-md bg-cream px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
              >
                Start a debate
              </button>
              <Link
                href={user ? "/dashboard" : "/auth/signup"}
                className="rounded-md border border-white/12 px-5 py-3 text-center text-sm font-semibold text-[#e8e1d2] transition-colors hover:bg-white/8"
              >
                {user ? "View dashboard" : "Create free account"}
              </Link>
            </div>

            <p className="mt-5 text-sm text-muted-2">
              Free to play · No downloads · Structured, timed rounds
            </p>
          </div>

          <div className="border border-line bg-surface p-5 shadow-2xl shadow-black/20">
            <div className="border-b border-line pb-4">
              <p className="text-sm font-semibold text-[#fffaf0]">
                Join an existing room
              </p>
              <p className="mt-1 text-sm text-muted-2">
                Enter the code once. We will take you straight to the lobby.
              </p>
            </div>

            <form onSubmit={handleJoinDebate} className="mt-5">
              <label htmlFor="room-code" className="sr-only">
                Room code
              </label>
              <div className="flex gap-2">
                <input
                  id="room-code"
                  type="text"
                  inputMode="numeric"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setJoinError("");
                  }}
                  placeholder="0000"
                  maxLength={4}
                  className="min-w-0 flex-1 rounded-md border border-line bg-black/20 px-4 py-3 font-mono text-lg tracking-[0.45em] text-white placeholder:text-white/20 focus:border-accent focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={joining || joinCode.length !== 4}
                  className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-[#111411] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                >
                  {joining ? "Joining" : "Join"}
                </button>
              </div>
              {joinError && (
                <p className="mt-3 text-sm text-rose-300">{joinError}</p>
              )}
            </form>

            <p className="mt-4 text-xs text-muted-2">
              Don&apos;t have a code?{" "}
              <button
                onClick={() => handleStartDebate()}
                className="text-accent underline-offset-4 hover:underline"
              >
                Create your own room
              </button>
              .
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-[#141719]">
          <div className="mx-auto grid max-w-6xl gap-px px-5 py-10 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="bg-[#141719] py-4 sm:px-6">
                <p className="text-xs font-semibold text-accent/70">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-3 text-base font-semibold text-[#fffaf0]">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#a9a295]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-accent/80">
                Featured motions
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#fffaf0]">
                Start from a strong premise.
              </h2>
            </div>
            <button
              onClick={() => handleStartDebate()}
              className="hidden rounded-md border border-white/12 px-4 py-2 text-sm font-semibold text-[#d7d0c2] transition-colors hover:bg-white/8 sm:block"
            >
              Custom motion
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURED_DEBATES.map((debate) => (
              <article
                key={debate.id}
                className="flex min-h-64 flex-col border border-line bg-surface p-5 transition hover:border-accent/30 hover:bg-surface-2"
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {debate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-line px-2 py-1 text-xs text-muted-2"
                    >
                      {tag}
                    </span>
                  ))}
                  <span
                    className={`ml-auto rounded border px-2 py-1 text-xs ${LEVEL_STYLES[debate.level]}`}
                  >
                    {debate.level}
                  </span>
                </div>

                <h3 className="text-lg font-semibold leading-snug text-[#fffaf0]">
                  {debate.topic}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-[#a9a295]">
                  {debate.description}
                </p>

                <div className="mt-6 flex gap-2 border-t border-line pt-4">
                  <button
                    onClick={() => handleStartDebate(debate.id)}
                    className="flex-1 rounded-md bg-cream px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white"
                  >
                    Use this motion
                  </button>
                  <Link
                    href="/debate/join"
                    className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-[#c7c0b3] transition-colors hover:bg-white/8"
                  >
                    Join
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-line bg-[#141719]">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-accent/80">
                  Common questions
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#fffaf0]">
                  Good to know before you start.
                </h2>
              </div>
              <Link
                href="/faq"
                className="hidden rounded-md border border-white/12 px-4 py-2 text-sm font-semibold text-[#d7d0c2] transition-colors hover:bg-white/8 sm:block"
              >
                All FAQs
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {FAQ_TEASER.map((item) => (
                <div
                  key={item.q}
                  className="border border-line bg-surface p-5"
                >
                  <h3 className="text-base font-semibold text-[#fffaf0]">
                    {item.q}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#a9a295]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href="/faq"
              className="mt-6 inline-flex text-sm font-semibold text-accent underline-offset-4 hover:underline sm:hidden"
            >
              Read all FAQs →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Sticky mobile call-to-action — one-tap start/join on small screens. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => handleStartDebate()}
            className="flex-1 rounded-md bg-accent px-4 py-3 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong"
          >
            Start a debate
          </button>
          <Link
            href="/debate/join"
            className="rounded-md border border-line-strong px-4 py-3 text-sm font-semibold text-cream transition-colors hover:bg-white/5"
          >
            Join
          </Link>
        </div>
      </div>

      <JsonLd data={websiteJsonLd} />
    </div>
  );
}
