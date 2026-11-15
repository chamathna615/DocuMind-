import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CookieConsent } from "@/components/common/CookieConsent";
import { openCookieSettings } from "@/utils/cookieConsent";

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "Who we are",
    body: [
      "DocuMind is an AI learning assistant that turns lecture recordings, PDF documents and written prompts into notes, quizzes and study guides. This is a university project demonstration.",
    ],
  },
  {
    title: "What information we collect",
    body: [
      "Account details: your name, email address and, if you use email sign-in, a securely hashed password. If you sign in with Google we receive your name and verified email address from Google.",
      "Your learning material: the files you upload, the prompts you write, and the notes, quizzes, study guides and quiz results generated from them.",
      "Security records: sign-in and security events (for example a password change), used to protect your account.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To create and show your learning materials, keep you signed in, protect your account and send the emails you ask for, such as email verification and password reset.",
      "To generate content, the text of your lecture material or prompt is sent to our AI service provider for processing. We do not sell your personal data and we do not use it for advertising.",
      "Uploaded files are deleted from our server as soon as their text has been extracted. Generated content is visible only to you.",
    ],
  },
  {
    title: "Cookies and browser storage",
    body: [
      "Essential: a secure session cookie that keeps you signed in, and a small record of the choice you make in the cookie pop-up. These are needed for the app to work and are always on.",
      "Preferences (optional): remembers settings such as your light or dark theme in this browser. If you do not allow this, the theme is not saved between visits.",
      "Statistics (optional): anonymous, aggregated usage statistics to help us improve the app. Nothing is collected for this unless you allow it.",
    ],
  },
  {
    title: "Your choices and rights",
    body: [
      "You can change your cookie choices at any time with the button below, or from “Cookie settings” on your Account page.",
      "From your Account page you can download a copy of your data, change your password, sign out, and permanently delete your account together with everything stored about it.",
    ],
  },
  {
    title: "How long we keep data",
    body: [
      "Your account and learning material are kept until you delete them or your account. In-app notifications are removed automatically after 60 days.",
    ],
  },
  {
    title: "Contact",
    body: ["Questions about privacy? Email project@example.com."],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm muted">Last updated: 7 November 2026</p>

        <div className="mt-8 space-y-8">
          {sections.map(({ title, body }) => (
            <section key={title}>
              <h2 className="text-xl font-bold">{title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-slate-600 dark:text-slate-300">
                {body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <button
          type="button"
          onClick={openCookieSettings}
          className="mt-10 inline-flex min-h-12 items-center rounded-xl border border-slate-950 px-5 py-3 text-sm font-semibold hover:bg-slate-100 dark:border-white dark:hover:bg-slate-800"
        >
          Change my cookie settings
        </button>
      </div>
      <CookieConsent />
    </div>
  );
}
