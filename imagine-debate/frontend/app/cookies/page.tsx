import Link from "next/link";

const STORAGE_ITEMS = [
  {
    name: "Supabase auth storage",
    purpose: "Keeps you signed in and refreshes your session securely.",
    type: "Strictly necessary",
    duration: "Until sign out, expiry, or browser data is cleared",
  },
  {
    name: "Debate room session storage",
    purpose:
      "Remembers your current debate topic, side, timer details, and outcome handoff while you move between debate pages.",
    type: "Strictly necessary",
    duration: "Current browser tab session, or until you leave the debate",
  },
  {
    name: "Cookie/storage preference",
    purpose:
      "May be used in future to remember whether you accepted optional cookies.",
    type: "Strictly necessary",
    duration: "Up to 6 months if optional cookies are introduced",
  },
];

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-[#101214] text-[#f4f1ea]">
      <nav className="border-b border-white/10 bg-[#101214]/90">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Imagine Debate
          </Link>

          <Link
            href="/"
            className="rounded-md px-3 py-2 text-sm text-[#c7c0b3] hover:bg-white/8 hover:text-white"
          >
            Home
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-5 py-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300/80">
          Privacy basics
        </p>

        <h1 className="text-4xl font-semibold tracking-tight text-[#fffaf0]">
          Cookies and browser storage
        </h1>

        <p className="mt-5 max-w-2xl text-sm leading-7 text-[#b9b3a7]">
          Imagine Debate currently uses only browser storage that is needed to
          provide core app features, such as keeping you signed in and carrying
          your debate state between pages. We do not currently use optional
          analytics, advertising, or marketing cookies.
        </p>

        <div className="mt-10 overflow-hidden border border-white/10 bg-[#171a1d]">
          <div className="grid grid-cols-4 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9f988c]">
            <span>Name</span>
            <span>Purpose</span>
            <span>Type</span>
            <span>Duration</span>
          </div>

          {STORAGE_ITEMS.map((item) => (
            <div
              key={item.name}
              className="grid grid-cols-1 gap-3 border-b border-white/10 px-4 py-4 text-sm last:border-b-0 sm:grid-cols-4"
            >
              <span className="font-medium text-[#fffaf0]">{item.name}</span>
              <span className="leading-6 text-[#b9b3a7]">{item.purpose}</span>
              <span className="text-emerald-300">{item.type}</span>
              <span className="text-[#9f988c]">{item.duration}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 border border-white/10 bg-[#141719] p-5">
          <h2 className="text-base font-semibold text-[#fffaf0]">
            If optional cookies are added later
          </h2>

          <p className="mt-3 text-sm leading-7 text-[#b9b3a7]">
            We should add a consent banner before setting analytics,
            advertising, heatmap, or similar optional cookies. Users should be
            able to accept, reject, or manage those choices before optional
            cookies are stored.
          </p>
        </div>
      </section>
    </main>
  );
}
