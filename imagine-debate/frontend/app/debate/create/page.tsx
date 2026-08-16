"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { trackEvent } from "@/lib/analytics";

interface DebateFormData {
  topic: string;
  description: string;
  ranked: boolean;
  timePerTurn: number;
}

const RANKED_OPTIONS = [
  {
    id: true,
    name: "Ranked",
    description: "Counts toward rating, wins, losses, and draws.",
  },
  {
    id: false,
    name: "Unranked",
    description: "Practice round — the result is saved, but ratings don't change.",
  },
] as const;

const TIME_OPTIONS = [
  { value: 30, label: "30 seconds", sublabel: "Quick fire" },
  { value: 60, label: "1 minute", sublabel: "Standard" },
  { value: 120, label: "2 minutes", sublabel: "Moderate" },
  { value: 180, label: "3 minutes", sublabel: "Thoughtful" },
  { value: 300, label: "5 minutes", sublabel: "Extended" },
];

// Topic pre-fills from featured debates on the landing page
const TOPIC_PRESETS: Record<string, { topic: string; description: string }> = {
  "ai-finance": {
    topic: "AI should regulate financial markets",
    description:
      "Should artificial intelligence hold regulatory authority over financial markets, replacing or supplementing human regulators?",
  },
  "remote-work": {
    topic: "Remote work is more productive than office work",
    description:
      "Does working from home outperform the traditional office environment for knowledge workers?",
  },
  "space-exploration": {
    topic: "Space exploration benefits humanity",
    description:
      "Are the costs of space programmes justified by the scientific, economic, and societal returns they provide?",
  },
  "universal-basic-income": {
    topic: "Universal basic income is feasible and effective",
    description:
      "Can a monthly unconditional payment to every citizen replace the existing welfare state without economic harm?",
  },
  "social-media-democracy": {
    topic: "Social media harms democracy",
    description:
      "Has the algorithmic feed done more damage than good to democratic discourse and political participation?",
  },
  "nuclear-energy": {
    topic: "Nuclear energy is the future of clean power",
    description:
      "Is nuclear the safest and most scalable path to a carbon-neutral electricity grid?",
  },
};

async function generateUniqueCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const { data, error } = await supabase.rpc("check_debate_code", {
      p_code: code,
    });
    if (error) throw error;
    if (!data?.[0]) return code;
  }
  return null;
}

function CreateDebateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from ?topic= param (set by featured debate cards on landing page)
  const [formData, setFormData] = useState<DebateFormData>(() => {
    const topicParam = searchParams.get("topic");
    const preset = topicParam ? TOPIC_PRESETS[topicParam] : undefined;

    return {
      topic: preset?.topic ?? "",
      description: preset?.description ?? "",
      ranked: true,
      timePerTurn: 120,
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setError("You must be logged in to create a debate.");
        setLoading(false);
        return;
      }

      const code = await generateUniqueCode();
      if (!code) {
        setError("Could not generate a unique code. Please try again.");
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase.from("debates").insert({
        id: code,
        topic: formData.topic.trim(),
        description: formData.description.trim() || null,
        ranked: formData.ranked,
        time_per_turn: formData.timePerTurn,
        created_by: session.user.id,
        status: "waiting",
      });

      if (insertError) {
        setError(
          insertError.code === "23505"
            ? "Code collision — please try again."
            : insertError.message
        );
        setLoading(false);
        return;
      }

      trackEvent("debate_created", { ranked: formData.ranked });

      router.push(`/debate/${code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create debate.");
      setLoading(false);
    }
  };

  const isPreset = !!searchParams.get("topic");

  return (
    <div className="min-h-screen bg-ink text-cream">

      <div className="max-w-2xl mx-auto px-6 py-12">

        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "New debate" },
          ]}
        />

        {/* Header */}
        <div className="mb-10">
          <p className="eyebrow mb-4">
            {isPreset ? "Custom motion" : "New room"}
          </p>
          <h1 className="font-serif text-3xl tracking-tight text-[#fffaf0] mb-2">
            {isPreset ? "Start this debate" : "Create a debate"}
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            {isPreset
              ? "We've pre-filled the topic from your selection. Adjust anything you like, then create your room."
              : "Set the topic, format, and turn timer. You'll get a 4-digit code to share with your opponent."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {error && (
            <div className="rounded-lg px-4 py-3 border border-against/25 bg-against/10 text-rose-300 text-sm">
              {error}
            </div>
          )}

          {/* Topic */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#c7c0b3]">
              Debate topic <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={formData.topic}
              onChange={(e) =>
                setFormData((p) => ({ ...p, topic: e.target.value }))
              }
              placeholder="e.g. AI should regulate financial markets"
              required
              className="w-full rounded-lg border border-line bg-black/20 text-cream px-4 py-3 text-sm placeholder:text-muted-2/50 focus:outline-none focus:border-accent transition-colors"
            />
            <p className="text-xs text-muted-2">
              State the proposition clearly — debaters will argue for or against it.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[#c7c0b3]">
              Description{" "}
              <span className="text-muted-2 font-normal">optional</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Add context or scope to help both sides understand the debate…"
              rows={3}
              className="w-full rounded-lg border border-line bg-black/20 text-cream px-4 py-3 text-sm placeholder:text-muted-2/50 focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Ranked */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#c7c0b3]">
              Ranked <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {RANKED_OPTIONS.map((option) => {
                const selected = formData.ranked === option.id;
                return (
                  <button
                    key={String(option.id)}
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        ranked: option.id,
                      }))
                    }
                    className={`text-left rounded-lg px-4 py-4 border transition-colors ${
                      selected
                        ? "bg-accent/10 border-accent/50 text-cream"
                        : "bg-surface border-line text-muted hover:border-line-strong hover:text-[#d7d0c2]"
                    }`}
                  >
                    <p className="text-sm font-medium mb-0.5">{option.name}</p>
                    <p className="text-xs opacity-70 leading-relaxed">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time per turn */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#c7c0b3]">
              Time per turn <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-5 gap-2">
              {TIME_OPTIONS.map(({ value, label, sublabel }) => {
                const selected = formData.timePerTurn === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({ ...p, timePerTurn: value }))
                    }
                    className={`text-center rounded-lg px-2 py-3 border transition-colors ${
                      selected
                        ? "bg-accent/10 border-accent/50 text-cream"
                        : "bg-surface border-line text-muted-2 hover:border-line-strong hover:text-muted"
                    }`}
                  >
                    <p className="text-sm font-semibold leading-tight">{label}</p>
                    <p className="text-[10px] mt-0.5 opacity-70">{sublabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-line pt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="flex-1 text-center rounded-lg px-5 py-3 bg-surface hover:bg-surface-2 border border-line text-muted hover:text-cream text-sm font-medium transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!formData.topic.trim() || loading}
              className="flex-1 rounded-lg px-5 py-3 bg-accent hover:bg-accent-strong disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-[#0d1117] text-sm font-semibold transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border border-black/20 border-t-black/60 rounded-full animate-spin" />
                  Creating…
                </span>
              ) : (
                "Create debate"
              )}
            </button>
          </div>
        </form>

        {/* Info box */}
        <div className="mt-8 rounded-xl px-5 py-4 border border-line bg-surface">
          <p className="text-xs text-muted-2 leading-relaxed">
            Once created, you&apos;ll land in a lobby with your{" "}
            <span className="text-muted font-mono">4-digit code</span>. Share
            it with your opponent — they enter it on the join screen to enter the
            same room. The debate starts when both players are ready.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CreateDebate() {
  return (
    <Suspense fallback={null}>
      <CreateDebateContent />
    </Suspense>
  );
}
