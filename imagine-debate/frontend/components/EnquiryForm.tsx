"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";
import { SITE } from "@/lib/site";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME = 100;
const MAX_EMAIL = 150;
const MAX_MESSAGE = 4000;

export function EnquiryForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: a real user never sees or fills this; bots usually do.
  const [website, setWebsite] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const trimmedMessage = message.trim();
  const isValidEmail = EMAIL_RE.test(email.trim());
  const canSubmit =
    trimmedName.length >= 2 &&
    isValidEmail &&
    trimmedMessage.length >= 10 &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!canSubmit) return;

    // Silently drop honeypot hits — behave like success so bots don't retry.
    if (website.trim().length > 0) {
      router.push("/contact/thank-you");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { error: insertError } = await supabase.from("enquiries").insert({
        name: trimmedName.slice(0, MAX_NAME),
        email: email.trim().slice(0, MAX_EMAIL),
        message: trimmedMessage.slice(0, MAX_MESSAGE),
        user_id: session?.user?.id ?? null,
      });

      if (insertError) throw insertError;

      router.push("/contact/thank-you");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `We couldn't send that. Please email ${SITE.supportEmail} instead.`
          : "Something went wrong. Please try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div
          role="alert"
          className="border border-against/30 bg-against/10 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="enq-name" className="mb-2 block text-sm font-medium text-cream">
          Your name
        </label>
        <input
          id="enq-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          autoComplete="name"
          required
          className="w-full border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none"
          placeholder="Jordan Bell"
        />
      </div>

      <div>
        <label htmlFor="enq-email" className="mb-2 block text-sm font-medium text-cream">
          Email address
        </label>
        <input
          id="enq-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={MAX_EMAIL}
          autoComplete="email"
          required
          className="w-full border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none"
          placeholder="you@example.com"
        />
        {email.length > 0 && !isValidEmail && (
          <p className="mt-1.5 text-xs text-rose-300">Enter a valid email address.</p>
        )}
      </div>

      <div>
        <label htmlFor="enq-message" className="mb-2 block text-sm font-medium text-cream">
          How can we help?
        </label>
        <textarea
          id="enq-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MAX_MESSAGE}
          rows={6}
          required
          className="w-full resize-y border border-line bg-black/20 px-4 py-3 text-sm leading-6 text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none"
          placeholder="Tell us what's on your mind — a bug, a question, or feedback."
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted-2">
          <span>{trimmedMessage.length < 10 ? "At least 10 characters." : " "}</span>
          <span>
            {message.length}/{MAX_MESSAGE}
          </span>
        </div>
      </div>

      {/* Honeypot field — visually hidden, off the tab order, ignored by users. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="enq-website">Leave this field empty</label>
        <input
          id="enq-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-accent px-5 py-3 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
      >
        {submitting ? "Sending…" : "Send enquiry"}
      </button>

      <p className="text-center text-xs text-muted-2">
        {SITE.responseTimePromise}
      </p>
    </form>
  );
}
