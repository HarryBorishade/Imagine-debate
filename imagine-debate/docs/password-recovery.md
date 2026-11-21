# Password recovery and local sign-in

Local preview accounts are separate from production Auth accounts. A production email/password pair does not create a local account. Sign up locally first. Local Auth catches password emails in Mailpit at http://127.0.0.1:54324; they do not arrive in Gmail or another external mailbox. The sign-in and recovery pages show this notice only when the configured Supabase API is loopback.

The sign-in page sends password-reset links to `/auth/reset-password`. That route listens for the SDK's verified password-recovery session and lets the user choose a new password without the old password. It uses the same strength rules as signup and Settings. Missing/expired/consumed links show an error with a path back to sign-in. An ordinary existing session alone does not display the recovery form. A short-lived, tab-scoped marker lets a verified recovery survive refresh; it stores no email, password or token and is only a UX marker, not a database authorization grant. Supabase Auth still authorizes the password update. After success the marker and password fields are cleared and the local recovery session is signed out.

Ordinary password changes in Settings still re-check the current password. No admin password override or production account change was introduced.

Before a hosted rollout, configure the exact staging/production `/auth/reset-password` redirect URL in that project's Auth allowlist, verify real mail delivery with its SMTP setup, and test recovery in the hosted environment. This work does not change hosted Auth settings or deploy anything.

Optional real local-browser regression (Node 24+, Chrome and the running private preview stack):

```powershell
$env:IMAGINE_LOCAL_RUNTIME = 'C:\Users\Harry\ImagineDebate-LocalTest'
node frontend/tests/password-recovery.browser.mjs
```

Run it from `imagine-debate/`. The test verifies missing-link and ordinary-session rejection, sends a real local reset email for a disposable account, consumes the link privately, checks refresh and password-mismatch handling, updates the password, confirms the old password fails and the new one works, and rejects reuse of the consumed link. It never prints passwords, API keys, message bodies or recovery tokens. The disposable Auth account is deleted afterward. The preview's mail inbox may retain its synthetic test emails.

The source-and-Git backup before this fix is in the private `login-recovery-20261121-201949` backup folder. Its restoration and Git state were verified. Installed dependencies/generated builds were excluded; local environment configuration was retained privately. No production rows were read or changed to diagnose the account shown in the screenshot; the existence check used only the local database.

Official references: [password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [recovery event handling](https://supabase.com/kb/troubleshooting/password-reset-link-logs-user-in-without-prompting-for-a-new-password-e51b22), [local Auth email testing](https://supabase.com/docs/guides/auth/testing-auth-flows).
