"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

interface DebateFormData {
  topic: string;
  description: string;
  debateFormat: "text-only" | "with-evidence";
  timePerTurn: number;
}

const DEBATE_FORMATS = [
  {
    id: "text-only",
    name: "Text only",
    description: "Pure argument-based debate with text submissions",
  },
  {
    id: "with-evidence",
    name: "With evidence",
    description: "Include links or citations to support arguments",
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
    const { data, error } = await supabase
      .from("debates")
      .select("id")
      .eq("id", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  return null;
}

function CreateDebateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [formData, setFormData] = useState<DebateFormData>({
    topic: "",
    description: "",
    debateFormat: "text-only",
    timePerTurn: 120,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pre-fill from ?topic= param (set by featured debate cards on landing page)
  useEffect(() => {
    const topicParam = searchParams.get("topic");
    if (topicParam && TOPIC_PRESETS[topicParam]) {
      const preset = TOPIC_PRESETS[topicParam];
      setFormData((prev) => ({
        ...prev,
        topic: preset.topic,
        description: preset.description,
      }));
    }
  }, [searchParams]);

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
        debate_format: formData.debateFormat,
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

      router.push(`/debate/${code}/lobby`);
    } catch (err: any) {
      setError(err.message || "Failed to create debate.");
      setLoading(false);
    }
  };

  const isPreset = !!searchParams.get("topic");

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-[#0d1117]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            href="/"
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            ← Home
          </Link>
          <span className="text-white/20">/</span>
          <Link
            href="/dashboard"
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-white/60 text-sm">New debate</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {isPreset ? "Start this debate" : "Create a debate"}
          </h1>
          <p className="text-white/40 text-sm leading-relaxed">
            {isPreset
              ? "We've pre-filled the topic from your selection. Adjust anything you like, then create your room."
              : "Set the topic, format, and turn timer. You'll get a 4-digit code to share with your opponent."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {error && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-sm">
              {error}
            </div>
          )}

          {/* Topic */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">
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
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:bg-white/[0.07] transition-all"
            />
            <p className="text-xs text-white/25">
              State the proposition clearly — debaters will argue for or against it.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-white/70">
              Description{" "}
              <span className="text-white/30 font-normal">optional</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Add context or scope to help both sides understand the debate…"
              rows={3}
              className="w-full rounded-xl bg-white/[0.05] border border-white/[0.08] text-white px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-indigo-500 focus:bg-white/[0.07] transition-all resize-none"
            />
          </div>

          {/* Format */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">
              Format <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {DEBATE_FORMATS.map((format) => {
                const selected = formData.debateFormat === format.id;
                return (
                  <button
                    key={format.id}
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        debateFormat: format.id,
                      }))
                    }
                    className={`text-left px-4 py-4 rounded-xl border transition-all ${
                      selected
                        ? "bg-indigo-600/15 border-indigo-500/40 text-white"
                        : "bg-white/[0.03] border-white/[0.07] text-white/50 hover:border-white/[0.15] hover:text-white/70"
                    }`}
                  >
                    <p className="text-sm font-medium mb-0.5">{format.name}</p>
                    <p className="text-xs opacity-60 leading-relaxed">
                      {format.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time per turn */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/70">
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
                    className={`text-center px-2 py-3 rounded-xl border transition-all ${
                      selected
                        ? "bg-indigo-600/15 border-indigo-500/40 text-white"
                        : "bg-white/[0.03] border-white/[0.07] text-white/40 hover:border-white/[0.15] hover:text-white/60"
                    }`}
                  >
                    <p className="text-sm font-semibold leading-tight">{label}</p>
                    <p className="text-[10px] mt-0.5 opacity-60">{sublabel}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.06] pt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="flex-1 text-center px-5 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 hover:text-white text-sm font-medium transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!formData.topic.trim() || loading}
              className="flex-1 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.06] disabled:text-white/20 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border border-white/30 border-t-white/80 rounded-full animate-spin" />
                  Creating…
                </span>
              ) : (
                "Create debate →"
              )}
            </button>
          </div>
        </form>

        {/* Info box */}
        <div className="mt-8 px-5 py-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <p className="text-xs text-white/30 leading-relaxed">
            Once created, you'll land in a lobby with your{" "}
            <span className="text-white/50 font-mono">4-digit code</span>. Share
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
