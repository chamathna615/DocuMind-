import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui";
import {
  OPEN_COOKIE_SETTINGS,
  getConsent,
  saveConsent,
} from "@/utils/cookieConsent";

type View = "summary" | "customize";

const OPTIONAL = [
  {
    key: "preferences",
    title: "Preferences",
    text: "Remembers choices you make in this browser, such as the light or dark theme.",
  },
  {
    key: "analytics",
    title: "Statistics",
    text: "Anonymous, aggregated usage statistics that help us improve the app.",
  },
] as const;

const solid =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200";
const outline =
  "flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-950 bg-transparent px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-100 dark:border-white dark:text-white dark:hover:bg-slate-800";

/**
 * Privacy pop-up (home page, and after signing in). The visitor can accept all cookies, customize what is
 * allowed, or continue without accepting optional cookies. The choice is remembered in this browser and can
 * be changed later from the footer of the home page or from the Account page.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide-in
  const [view, setView] = useState<View>("summary");
  const [choice, setChoice] = useState({ preferences: false, analytics: false });
  const dialog = useRef<HTMLDivElement>(null);

  // Appears by itself shortly after the page has finished loading, as long as no choice has been saved yet.
  useEffect(() => {
    if (getConsent() !== null) return;
    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => {
        if (getConsent() === null) setOpen(true);
      }, 600);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Showing the saved choice when the pop-up is opened again.
  const loadSaved = () => {
    const saved = getConsent();
    setChoice({ preferences: saved?.preferences ?? false, analytics: saved?.analytics ?? false });
  };

  useEffect(() => {
    const reopen = () => {
      loadSaved();
      setView("customize");
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, reopen);
  }, []);

  // The visitor may have decided in another tab, or from the other page of this app: then nothing is shown.
  useEffect(() => {
    const onStorage = () => {
      if (getConsent() !== null && view === "summary") setOpen(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [view]);

  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open, view]);

  if (!open) return null;

  const decide = (next: { preferences: boolean; analytics: boolean }) => {
    saveConsent(next);
    setOpen(false);
    setView("summary");
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/30 transition-opacity duration-300 sm:items-end sm:justify-start sm:p-6 ${shown ? "opacity-100" : "opacity-0"}`}
      role="presentation"
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-title"
        aria-describedby="cookie-text"
        className={`transition-transform duration-300 ${shown ? "translate-y-0" : "translate-y-6"} max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-2xl focus:outline-none dark:border-slate-700 dark:bg-slate-900 sm:max-w-md sm:rounded-2xl`}
      >
        <h2 id="cookie-title" className="text-xl font-bold text-slate-700 dark:text-slate-100">
          We value your privacy
        </h2>

        {view === "summary" ? (
          <>
            <div id="cookie-text" className="mt-4 space-y-4 text-[15px] leading-6 text-slate-600 dark:text-slate-300">
              <p>
                We value your privacy. We use cookies and other tracking technologies that are essential for DocuMind
                to work and to produce aggregated statistics. With your consent, we will also use technologies that
                remember your preferences and help us improve our product and services. To give your consent, tap{" "}
                <em>Accept all cookies</em>.
              </p>
              <p>
                Alternatively, you can customize your privacy settings by tapping <em>Customize cookies</em>, or by
                going to <em>Cookie settings</em> on the Account page or in the footer at any time. If you don&apos;t
                want us to use non-essential technologies, tap <em>Continue without accepting</em>.
              </p>
              <p>
                For more information about how we process your personal data, take a look at our{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className={solid} onClick={() => decide({ preferences: true, analytics: true })}>
                Accept all cookies
              </button>
              <button
                type="button"
                className={solid}
                onClick={() => decide({ preferences: false, analytics: false })}
              >
                Continue without accepting
              </button>
              <button
                type="button"
                className={outline}
                onClick={() => {
                  loadSaved();
                  setView("customize");
                }}
              >
                Customize cookies
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="cookie-text" className="mt-3 text-[15px] leading-6 text-slate-600 dark:text-slate-300">
              Choose which technologies you allow. You can change this at any time. See our{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Privacy Policy
              </a>{" "}
              for details.
            </p>
            <ul className="mt-5 space-y-3">
              <li className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    Essential
                  </p>
                  <p className="mt-1 text-sm muted">Keeps you signed in and remembers this choice.</p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs font-semibold muted">Always on</span>
              </li>
              {OPTIONAL.map(({ key, title, text }) => (
                <li
                  key={key}
                  className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                >
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-sm muted">{text}</p>
                  </div>
                  <Switch
                    checked={choice[key]}
                    label={title}
                    onChange={(value) => setChoice((current) => ({ ...current, [key]: value }))}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" className={solid} onClick={() => decide(choice)}>
                Save my choices
              </button>
              <button
                type="button"
                className={solid}
                onClick={() => decide({ preferences: true, analytics: true })}
              >
                Accept all cookies
              </button>
              <button type="button" className={outline} onClick={() => setView("summary")}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
