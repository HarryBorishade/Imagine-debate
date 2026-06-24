"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

interface User {
  id: string;
  email: string;
  user_metadata?: {
    username?: string;
  };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user as User);
      }
      setLoading(false);
    }

    getUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user as User);
      } else {
        setUser(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Navigation */}
      <nav className="bg-slate-800/50 backdrop-blur border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">🎯 IMAGINE-DEBATE</h1>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-slate-300">
                  Welcome, <strong>{user.user_metadata?.username || user.email}</strong>
                </span>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
                >
                  Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all"
                >
                  Login
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">
            Welcome to IMAGINE-DEBATE
          </h2>
          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Engage in structured, real-time debates with an AI judge. Present your
            arguments, rebut your opponent, and receive detailed feedback.
          </p>

          {user ? (
            <div className="flex gap-4 justify-center">
              <Link
                href="/debate/join"
                className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
              >
                Join a Debate
              </Link>
              <Link
                href="/dashboard"
                className="px-8 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all"
              >
                My Debates
              </Link>
            </div>
          ) : (
            <div className="flex gap-4 justify-center">
              <Link
                href="/auth/signup"
                className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
              >
                Get Started
              </Link>
              <Link
                href="/auth/login"
                className="px-8 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition-all"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h3 className="text-3xl font-bold text-white mb-12 text-center">
          How It Works
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-8 hover:border-blue-500 transition-all">
            <div className="text-4xl mb-4">🤝</div>
            <h4 className="text-xl font-bold text-white mb-3">Real-Time Sync</h4>
            <p className="text-slate-300">
              Connect with your opponent in a live debate room. See messages
              instantly as they type.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-8 hover:border-blue-500 transition-all">
            <div className="text-4xl mb-4">📋</div>
            <h4 className="text-xl font-bold text-white mb-3">Structured Format</h4>
            <p className="text-slate-300">
              Follow a proven debate structure: opening, claims, evidence, rebuttals,
              and closing statements.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-8 hover:border-blue-500 transition-all">
            <div className="text-4xl mb-4">🤖</div>
            <h4 className="text-xl font-bold text-white mb-3">AI Judging</h4>
            <p className="text-slate-300">
              Get detailed feedback and scoring from our AI judge. Learn from your
              arguments.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Debates Section */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h3 className="text-3xl font-bold text-white mb-12 text-center">
          Recent Debates
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Debate Card 1 */}
          <Link href="/debate/1">
            <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-700/70 transition-all cursor-pointer">
              <h4 className="text-xl font-bold text-white mb-2">
                AI Should Regulate Finance
              </h4>
              <p className="text-slate-300 mb-4">
                Participants debate whether artificial intelligence should play a
                regulatory role in financial markets.
              </p>
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>👥 2 participants</span>
                <span>⭐ 4.8/5</span>
              </div>
            </div>
          </Link>

          {/* Debate Card 2 */}
          <Link href="/debate/2">
            <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-700/70 transition-all cursor-pointer">
              <h4 className="text-xl font-bold text-white mb-2">
                Remote Work is More Productive
              </h4>
              <p className="text-slate-300 mb-4">
                A compelling debate on whether working remotely leads to better
                productivity than office work.
              </p>
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>👥 2 participants</span>
                <span>⭐ 4.5/5</span>
              </div>
            </div>
          </Link>

          {/* Debate Card 3 */}
          <Link href="/debate/3">
            <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-700/70 transition-all cursor-pointer">
              <h4 className="text-xl font-bold text-white mb-2">
                Space Exploration Benefits Humanity
              </h4>
              <p className="text-slate-300 mb-4">
                Explore whether investments in space exploration provide tangible
                benefits to society.
              </p>
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>👥 2 participants</span>
                <span>⭐ 4.9/5</span>
              </div>
            </div>
          </Link>

          {/* Debate Card 4 */}
          <Link href="/debate/4">
            <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-700/70 transition-all cursor-pointer">
              <h4 className="text-xl font-bold text-white mb-2">
                Universal Basic Income Works
              </h4>
              <p className="text-slate-300 mb-4">
                Debate the feasibility and effectiveness of implementing a universal
                basic income program.
              </p>
              <div className="flex justify-between items-center text-slate-400 text-sm">
                <span>👥 2 participants</span>
                <span>⭐ 4.6/5</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      {!user && (
        <section className="max-w-6xl mx-auto px-6 py-16 text-center">
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 rounded-lg p-12">
            <h3 className="text-3xl font-bold text-white mb-4">
              Ready to Debate?
            </h3>
            <p className="text-slate-300 mb-8 text-lg max-w-2xl mx-auto">
              Join thousands of users engaging in meaningful debates. Sign up today
              and start presenting your arguments.
            </p>
            <Link
              href="/auth/signup"
              className="inline-block px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
            >
              Create Your Account
            </Link>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-slate-800/50 border-t border-slate-700 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-400">
          <p>© 2026 IMAGINE-DEBATE. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
