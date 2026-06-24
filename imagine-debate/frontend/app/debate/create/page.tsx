"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    name: "Text Only",
    description: "Pure argument-based debate with text submissions",
  },
  {
    id: "with-evidence",
    name: "With Evidence",
    description: "Include links or citations to support arguments",
  },
];

const TIME_OPTIONS = [30, 60, 120, 180, 300];

function formatTime(seconds: number) {
  const map: Record<number, string> = {
    30: "30 seconds (Quick)",
    60: "1 minute (Standard)",
    120: "2 minutes (Moderate)",
    180: "3 minutes (Thoughtful)",
    300: "5 minutes (Extended)",
  };
  return map[seconds] ?? `${seconds} seconds`;
}

// Tries up to 10 times to find a 4-digit code not already in the debates table
async function generateUniqueCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    const { data, error } = await supabase
      .from("debates")
      .select("id")
      .eq("id", code)
      .maybeSingle();

    if (error) throw error;

    // No row found — this code is free
    if (!data) return code;
  }

  // Extremely unlikely but handle gracefully
  return null;
}

export default function CreateDebate() {
  const router = useRouter();

  const [formData, setFormData] = useState<DebateFormData>({
    topic: "",
    description: "",
    debateFormat: "text-only",
    timePerTurn: 120,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "timePerTurn" ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setError("You must be logged in to create a debate");
        setLoading(false);
        return;
      }

      const code = await generateUniqueCode();
      if (!code) {
        setError("Could not generate a unique debate code. Please try again.");
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
        // Unique violation — rare race condition where two users grabbed the same code
        if (insertError.code === "23505") {
          setError("Code collision — please try creating again.");
        } else {
          setError(insertError.message);
        }
        setLoading(false);
        return;
      }

      router.push(`/debate/${code}/lobby`);
    } catch (err: any) {
      setError(err.message || "Failed to create debate");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-white mt-4">
            Create a New Debate
          </h1>
          <p className="text-slate-400 mt-2">
            Set up the topic, format, and rules for your debate
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-6 py-12">
        <form
          onSubmit={handleSubmit}
          className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-8 space-y-6"
        >
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* Topic */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Debate Topic *
            </label>
            <input
              type="text"
              name="topic"
              value={formData.topic}
              onChange={handleChange}
              placeholder="e.g., AI should regulate financial markets"
              required
              className="w-full rounded-lg bg-slate-600 border border-slate-500 text-white px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              The main topic or proposition for this debate
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Description (Optional)
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Provide context or specific details about what will be debated..."
              rows={4}
              className="w-full rounded-lg bg-slate-600 border border-slate-500 text-white px-4 py-3 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Helps opponents understand the scope of the debate
            </p>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Debate Format *
            </label>
            <div className="space-y-3">
              {DEBATE_FORMATS.map((format) => {
                const isSelected = formData.debateFormat === format.id;
                return (
                  <label
                    key={format.id}
                    className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-slate-500 hover:border-slate-400"
                    }`}
                  >
                    <input
                      type="radio"
                      name="debateFormat"
                      value={format.id}
                      checked={isSelected}
                      onChange={handleChange}
                      className="mt-1 w-4 h-4 cursor-pointer"
                    />
                    <div className="ml-4">
                      <p className="font-medium text-white">{format.name}</p>
                      <p className="text-sm text-slate-400">
                        {format.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Time Per Turn */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Time Per Turn *
            </label>
            <select
              name="timePerTurn"
              value={formData.timePerTurn}
              onChange={handleChange}
              className="w-full rounded-lg bg-slate-600 border border-slate-500 text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {formatTime(time)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              How long each person has to respond during their turn
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-6 border-t border-slate-600">
            <Link href="/dashboard" className="flex-1">
              <button
                type="button"
                className="w-full px-6 py-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
              >
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={!formData.topic.trim() || loading}
              className="flex-1 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 disabled:cursor-not-allowed text-white font-semibold transition-all"
            >
              {loading ? "Creating..." : "Create Debate"}
            </button>
          </div>
        </form>

        {/* Tips */}
        <div className="mt-8 p-6 bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-3">
            💡 Debate Tips
          </h3>
          <ul className="text-slate-300 space-y-2 text-sm">
            <li>✓ Choose a clear, specific topic for better debates</li>
            <li>✓ Provide context to help your opponent understand the scope</li>
            <li>✓ Shorter time limits create faster-paced debates</li>
            <li>✓ Longer time limits allow for more thorough arguments</li>
          </ul>
        </div>
      </div>
    </div>
  );
}