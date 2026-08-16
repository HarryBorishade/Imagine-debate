// Client-side password strength evaluation + meter. Pure function so both the
// signup and settings forms can gate submission on the same rules.

export interface PasswordCheck {
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  score: number; // 0..4 (number of requirements met)
  label: "Very weak" | "Weak" | "Fair" | "Good" | "Strong";
  checks: PasswordCheck[];
  /** Minimum bar to allow account creation / password change. */
  isAcceptable: boolean;
}

const LABELS: PasswordStrengthResult["label"][] = [
  "Very weak",
  "Weak",
  "Fair",
  "Good",
  "Strong",
];

export function evaluatePassword(password: string): PasswordStrengthResult {
  const checks: PasswordCheck[] = [
    { label: "At least 8 characters", met: password.length >= 8 },
    {
      label: "Upper & lowercase letters",
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { label: "At least one number", met: /\d/.test(password) },
    {
      label: "At least one symbol",
      met: /[^A-Za-z0-9]/.test(password),
    },
  ];

  const score = checks.filter((c) => c.met).length;

  // Require a reasonable length plus at least three of the four categories.
  const hasLength = checks[0].met;
  const isAcceptable = hasLength && score >= 3;

  // Nudge the visual label up for long, complex passwords.
  const label =
    password.length >= 12 && score === 4 ? "Strong" : LABELS[score];

  return { score, label, checks, isAcceptable };
}

const BAR_COLORS = [
  "bg-rose-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-emerald-400",
];

const LABEL_COLORS = [
  "text-rose-300",
  "text-rose-300",
  "text-amber-300",
  "text-emerald-300",
  "text-emerald-300",
];

export function PasswordStrengthMeter({
  password,
  className = "",
}: {
  password: string;
  className?: string;
}) {
  if (!password) return null;

  const { score, label, checks } = evaluatePassword(password);

  return (
    <div className={`mt-2.5 ${className}`} aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" role="presentation">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < score ? BAR_COLORS[score] : "bg-white/10"
              }`}
            />
          ))}
        </div>
        <span className={`w-16 text-right text-xs font-medium ${LABEL_COLORS[score]}`}>
          {label}
        </span>
      </div>

      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-center gap-1.5 text-xs ${
              check.met ? "text-emerald-300" : "text-muted-2"
            }`}
          >
            <span aria-hidden="true">{check.met ? "✓" : "○"}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
