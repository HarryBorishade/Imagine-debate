"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

interface Debate {
  id: string;
  topic: string;
  opponent?: string;
  status: string;
  phase?: string;
  score?: number;
}

interface UserStats {
  totalDebates: number;
  wins: number;
  losses: number;
  avgScore: number;
}

interface Notification {
  id: string;
  message: string;
  timestamp: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [activeDebates, setActiveDebates] = useState<Debate[]>([]);
  const [recentDebates, setRecentDebates] = useState<Debate[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalDebates: 0,
    wins: 0,
    losses: 0,
    avgScore: 0,
  });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <div>
              <h1 className="text-3xl font-bold text-white">Dashboard</h1>
              <p className="text-slate-400 text-sm mt-1">
                Welcome back, {user?.user_metadata?.username || user?.email}
              </p>
            </div>
          </Link>

          <div className="flex gap-3">
            <Link href="/">
              <button className="px-6 py-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all">
                Home
              </button>
            </Link>
            <Link href="/debate/create">
              <button className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all">
                Start New Debate
              </button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-4 gap-6">
          {/* LEFT COLUMN (Main Content) */}
          <div className="col-span-3 space-y-6">
            {/* Active Debates */}
            <section className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Active Debates</h2>

              {activeDebates.length === 0 ? (
                <p className="text-slate-400">
                  No active debates. Start one now!
                </p>
              ) : (
                <div className="space-y-3">
                  {activeDebates.map((debate) => (
                    <Link key={debate.id} href={`/debate/${debate.id}`}>
                      <div className="p-4 border border-slate-600 rounded-lg hover:border-blue-500 hover:bg-slate-600/50 transition-all cursor-pointer">
                        <p className="font-medium text-white">{debate.topic}</p>
                        <p className="text-sm text-slate-400">
                          vs {debate.opponent || "Opponent"} • {debate.phase || "Ongoing"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Debates */}
            <section className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Recent Debates</h2>

              {recentDebates.length === 0 ? (
                <p className="text-slate-400">
                  No completed debates yet. Start your first debate!
                </p>
              ) : (
                <div className="space-y-3">
                  {recentDebates.map((debate) => (
                    <Link key={debate.id} href={`/debate/${debate.id}`}>
                      <div className="p-4 border border-slate-600 rounded-lg hover:border-blue-500 hover:bg-slate-600/50 transition-all cursor-pointer">
                        <p className="font-medium text-white">{debate.topic}</p>
                        <p className="text-sm text-slate-400">
                          vs {debate.opponent || "Opponent"} • Score: {debate.score || "N/A"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN (Stats + Notifications) */}
          <div className="col-span-1 space-y-6">
            {/* User Stats */}
            <section className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Your Stats</h2>

              <div className="space-y-3 text-slate-300">
                <div className="flex justify-between">
                  <span>Total Debates:</span>
                  <span className="font-bold text-white">
                    {stats.totalDebates}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Wins:</span>
                  <span className="font-bold text-green-400">{stats.wins}</span>
                </div>
                <div className="flex justify-between">
                  <span>Losses:</span>
                  <span className="font-bold text-red-400">{stats.losses}</span>
                </div>
                <div className="flex justify-between border-t border-slate-600 pt-3">
                  <span>Average Score:</span>
                  <span className="font-bold text-blue-400">
                    {stats.avgScore.toFixed(1)}
                  </span>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Notifications</h2>

              {notifications.length === 0 ? (
                <p className="text-slate-400 text-sm">No notifications yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 bg-slate-600/50 border border-slate-600 rounded text-sm text-slate-300"
                    >
                      <p>{n.message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(n.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
