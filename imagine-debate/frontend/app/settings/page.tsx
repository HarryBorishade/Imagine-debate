"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  evaluatePassword,
  PasswordStrengthMeter,
} from "@/components/PasswordStrength";

interface SessionUser {
  id: string;
  email?: string;
  user_metadata?: { username?: string };
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-panel p-5 sm:p-6">
      <h2 className="font-serif text-lg text-[#fffaf0]">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-muted-2">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Banner({ kind, message }: { kind: "error" | "success"; message: string }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`mb-4 border px-4 py-3 text-sm ${
        kind === "error"
          ? "border-against/30 bg-against/10 text-rose-200"
          : "border-accent/30 bg-accent/10 text-emerald-200"
      }`}
    >
      {message}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Username
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<{
    error?: string;
    success?: string;
    saving: boolean;
  }>({ saving: false });

  // Email
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{
    error?: string;
    success?: string;
    saving: boolean;
  }>({ saving: false });

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{
    error?: string;
    success?: string;
    saving: boolean;
  }>({ saving: false });

  // Delete account
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<{
    error?: string;
    deleting: boolean;
  }>({ deleting: false });

  useEffect(() => {
    async function loadUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push("/auth/login");
        return;
      }

      const sessionUser = session.user as SessionUser;
      setUser(sessionUser);
      setUsername(sessionUser.user_metadata?.username || "");
      setEmail(sessionUser.email || "");
      setLoading(false);
    }

    loadUser();
  }, [router]);

  const isValidUsername = username.trim().length >= 3 && username.trim().length <= 20;
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const newPasswordStrength = evaluatePassword(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword !== "";
  const canChangePassword =
    currentPassword.length > 0 &&
    newPasswordStrength.isAcceptable &&
    passwordsMatch;

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameStatus({ saving: true });

    const trimmed = username.trim();

    if (!isValidUsername) {
      setUsernameStatus({ saving: false, error: "Username must be 3–20 characters." });
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: { username: trimmed },
    });

    if (error) {
      setUsernameStatus({ saving: false, error: error.message });
    } else {
      setUsernameStatus({ saving: false, success: "Username updated." });
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus({ saving: true });

    const trimmed = email.trim();

    if (!isValidEmail) {
      setEmailStatus({ saving: false, error: "Please enter a valid email address." });
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: trimmed });

    if (error) {
      setEmailStatus({ saving: false, error: error.message });
    } else {
      setEmailStatus({
        saving: false,
        success:
          "Check your inbox to confirm the new address — it won't take effect until you do.",
      });
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus({ saving: true });

    if (!newPasswordStrength.isAcceptable) {
      setPasswordStatus({ saving: false, error: "Please choose a stronger password." });
      return;
    }

    if (!passwordsMatch) {
      setPasswordStatus({ saving: false, error: "New passwords do not match." });
      return;
    }

    if (!user?.email) {
      setPasswordStatus({ saving: false, error: "Could not verify your account email." });
      return;
    }

    // Re-check the current password before allowing a change — a valid
    // session alone shouldn't be enough to lock the real owner out if a
    // token were ever stolen or left signed in on a shared device.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (reauthError) {
      setPasswordStatus({ saving: false, error: "Current password is incorrect." });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setPasswordStatus({ saving: false, error: error.message });
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ saving: false, success: "Password updated." });
    }
  }

  async function handleDeleteAccount() {
    if (!user?.email || deleteConfirmText.trim() !== user.email) return;

    setDeleteStatus({ deleting: true });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const { error } = await supabase.functions.invoke("delete-account", {});

      if (error) {
        throw new Error(error.message || "Could not delete your account.");
      }

      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      setDeleteStatus({
        deleting: false,
        error:
          err instanceof Error ? err.message : "Could not delete your account.",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b border-line bg-ink/90">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="font-serif text-lg tracking-tight text-cream">
            Imagine Debate
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "Settings" },
          ]}
        />

        <h1 className="font-serif text-3xl tracking-tight text-[#fffaf0]">
          Account settings
        </h1>
        <p className="mt-2 text-sm text-muted">
          Manage the private details on your account.
        </p>

        <div className="mt-8 space-y-6">
          <Card title="Username" description="Shown to opponents in debate rooms.">
            <form onSubmit={handleUsernameSubmit} className="space-y-4">
              {usernameStatus.error && <Banner kind="error" message={usernameStatus.error} />}
              {usernameStatus.success && (
                <Banner kind="success" message={usernameStatus.success} />
              )}

              <div>
                <label htmlFor="username" className="mb-2 block text-sm font-medium text-cream">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream focus:border-accent focus:outline-none sm:max-w-sm"
                />
                {username && !isValidUsername && (
                  <p className="mt-1.5 text-xs text-rose-300">3–20 characters required.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!isValidUsername || usernameStatus.saving}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                {usernameStatus.saving ? "Saving…" : "Save username"}
              </button>
            </form>
          </Card>

          <Card
            title="Email address"
            description="Used to sign in and for account notices."
          >
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {emailStatus.error && <Banner kind="error" message={emailStatus.error} />}
              {emailStatus.success && <Banner kind="success" message={emailStatus.success} />}

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-cream">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream focus:border-accent focus:outline-none sm:max-w-sm"
                />
                {email && !isValidEmail && (
                  <p className="mt-1.5 text-xs text-rose-300">Please enter a valid email.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  !isValidEmail || email.trim() === user?.email || emailStatus.saving
                }
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                {emailStatus.saving ? "Saving…" : "Update email"}
              </button>
            </form>
          </Card>

          <Card title="Password" description="Choose a strong, unique password.">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordStatus.error && <Banner kind="error" message={passwordStatus.error} />}
              {passwordStatus.success && (
                <Banner kind="success" message={passwordStatus.success} />
              )}

              <div>
                <label
                  htmlFor="current-password"
                  className="mb-2 block text-sm font-medium text-cream"
                >
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream focus:border-accent focus:outline-none sm:max-w-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="mb-2 block text-sm font-medium text-cream"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream focus:border-accent focus:outline-none sm:max-w-sm"
                />
                <PasswordStrengthMeter password={newPassword} className="sm:max-w-sm" />
              </div>

              <div>
                <label
                  htmlFor="confirm-new-password"
                  className="mb-2 block text-sm font-medium text-cream"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream focus:border-accent focus:outline-none sm:max-w-sm"
                />
                {confirmPassword && !passwordsMatch && (
                  <p className="mt-1.5 text-xs text-rose-300">Passwords do not match.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canChangePassword || passwordStatus.saving}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                {passwordStatus.saving ? "Updating…" : "Update password"}
              </button>
            </form>
          </Card>

          <Card
            title="Danger zone"
            description="Permanently delete your account and all associated data."
          >
            {deleteStatus.error && <Banner kind="error" message={deleteStatus.error} />}

            <div className="rounded-lg border border-against/30 bg-against/[0.06] p-4">
              <p className="text-sm leading-6 text-rose-100/90">
                This deletes your account, profile, and rating immediately and
                cannot be undone. Type your email address (
                <span className="font-mono text-rose-200">{user?.email}</span>) to
                confirm.
              </p>

              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={user?.email}
                className="mt-4 w-full rounded-lg border border-against/30 bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-rose-200/30 focus:border-against focus:outline-none sm:max-w-sm"
              />

              <button
                onClick={handleDeleteAccount}
                disabled={
                  deleteConfirmText.trim() !== user?.email || deleteStatus.deleting
                }
                className="mt-4 rounded-lg bg-against px-5 py-2.5 text-sm font-semibold text-[#2a0a0f] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                {deleteStatus.deleting ? "Deleting…" : "Permanently delete account"}
              </button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
