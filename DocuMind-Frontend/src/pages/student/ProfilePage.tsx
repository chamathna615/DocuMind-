import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bell,
  BrainCircuit,
  Camera,
  Check,
  Cookie,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  ListChecks,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateUserProfile,
  updatePreferences,
  changePassword,
  downloadMyData,
} from "@/api/authApi";
import { getMyAnalytics } from "@/api/analyticsApi";
import { Button, Card, ErrorText, Input, Skeleton, Switch } from "@/components/ui";
import { PageHeader } from "@/components/common/shared";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fileToAvatarDataUrl } from "@/utils/image";
import { cn } from "@/utils/helpers";
import type { UserPreferences } from "@/types";
import { openCookieSettings } from "@/utils/cookieConsent";

const DEFAULT_PREFERENCES: UserPreferences = {
  quizSize: 10,
  outputs: { notes: true, quiz: true, tutorial: true },
  notifications: { ready: true, failed: true, weekly: false },
};

const QUIZ_SIZES = [5, 10, 15, 20];

const OUTPUT_ITEMS = [
  { key: "notes", label: "Summary notes", hint: "A clear summary of each lecture", icon: FileText },
  { key: "quiz", label: "Quiz", hint: "Questions to test yourself", icon: BrainCircuit },
  { key: "tutorial", label: "Tutorial / study guide", hint: "A step-by-step way to study", icon: GraduationCap },
] as const;

const NOTIFICATION_ITEMS = [
  {
    key: "ready",
    label: "Learning materials are ready",
    hint: "When your notes, quiz or study guide have finished generating.",
  },
  {
    key: "failed",
    label: "Processing fails",
    hint: "If a lecture could not be processed, so you can retry it.",
  },
  {
    key: "weekly",
    label: "Weekly study summary",
    hint: "A recap of your lectures and quiz results, at most once a week.",
  },
] as const;

const initialsOf = (name?: string) =>
  (name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function formatJoined(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : format(date, "d MMM yyyy");
}

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

/** One section of the page: an icon, a title with a short description, then the content. */
function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <Card className="overflow-hidden">
        <header className="flex items-start gap-4 border-b border-slate-100 bg-gradient-to-r from-purple-50/70 to-transparent px-5 py-5 dark:border-slate-800 dark:from-purple-950/30 sm:px-7">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm muted">{description}</p>}
          </div>
        </header>
        <div className="p-5 sm:p-7">{children}</div>
      </Card>
    </section>
  );
}

/** A row with an icon, a title, a short explanation and a button on the right. */
function ActionRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const { user, setUser, signOut, deleteAccount } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { hash } = useLocation();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Google-only accounts have no password to re-enter
  const needsPassword = user?.provider !== "google";

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeletePassword("");
  };

  const [busy, setBusy] = useState<"export" | null>(null);

  // Opening /profile#notifications (from the bell) or clicking the navigation scrolls to that section.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  // Privacy: a JSON copy of everything stored about this account
  const handleExport = async () => {
    setBusy("export");
    try {
      await downloadMyData();
      toast.success("Your data export has been downloaded");
    } catch (err) {
      toast.error(errorMessage(err, "Unable to export your data right now."));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      toast.success("Your account has been permanently deleted");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(errorMessage(err, "Unable to delete your account right now."));
      setDeleting(false);
    }
  };

  /* ---------------- overview (real numbers from the analytics endpoint) ---------------- */
  const stats = useQuery({ queryKey: ["analytics", "account"], queryFn: getMyAnalytics });

  /* ---------------- personal information ---------------- */
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoUrl = user?.photoUrl ?? null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    defaultValues: {
      name: user?.name ?? "",
      programme: user?.programme ?? "",
      language: user?.preferredLanguage ?? "English",
    },
  });

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const resized = await fileToAvatarDataUrl(file); // small square picture, as the server expects
      setUser(await updateUserProfile({ photoUrl: resized }));
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(errorMessage(err, "Unable to update your photo right now."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      setUser(await updateUserProfile({ photoUrl: "" }));
      toast.info("Profile photo removed");
    } catch (err) {
      toast.error(errorMessage(err, "Unable to remove your photo right now."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async (values: { name: string; programme: string; language: string }) => {
    try {
      const next = await updateUserProfile({
        name: values.name.trim(),
        programme: values.programme.trim(),
        preferredLanguage: values.language,
      });
      setUser(next);
      reset({ name: next.name, programme: next.programme ?? "", language: next.preferredLanguage });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(errorMessage(err, "Unable to update your profile right now."));
    }
  };

  /* ---------------- preferences (defaults for Upload and Write-a-prompt) ---------------- */
  const prefs = user?.preferences ?? DEFAULT_PREFERENCES;
  const [quizSize, setQuizSize] = useState(prefs.quizSize);
  const [outputs, setOutputs] = useState(prefs.outputs);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const noOutputs = !outputs.notes && !outputs.quiz && !outputs.tutorial;
  const prefsChanged =
    quizSize !== prefs.quizSize ||
    outputs.notes !== prefs.outputs.notes ||
    outputs.quiz !== prefs.outputs.quiz ||
    outputs.tutorial !== prefs.outputs.tutorial;

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      setUser(await updatePreferences({ quizSize, outputs }));
      toast.success("Preferences saved. They are now your defaults when you upload or write a prompt.");
    } catch (err) {
      toast.error(errorMessage(err, "Unable to save your preferences right now."));
    } finally {
      setSavingPrefs(false);
    }
  };

  /* ---------------- notification settings (saved on the server, so they really apply) ---------------- */
  const [notif, setNotif] = useState(prefs.notifications);
  const [notifSaving, setNotifSaving] = useState(false);

  const toggleNotification = async (key: keyof UserPreferences["notifications"], value: boolean) => {
    const previous = notif;
    const next = { ...notif, [key]: value };
    setNotif(next); // switch moves immediately
    setNotifSaving(true);
    try {
      setUser(await updatePreferences({ notifications: next }));
      toast.success("Notification settings saved");
    } catch (err) {
      setNotif(previous); // the server refused, so put the switch back
      toast.error(errorMessage(err, "Unable to save your notification settings right now."));
    } finally {
      setNotifSaving(false);
    }
  };

  const totals = stats.data?.totals;
  const quiz = stats.data?.quiz;
  const joined = formatJoined(user?.joinedAt);

  const overviewStats: Array<{ label: string; value: string }> =
    totals && quiz
      ? [
          { label: "Lectures", value: String(totals.lectures) },
          { label: "Completed", value: String(totals.completed) },
          { label: "Quizzes taken", value: String(quiz.attempts) },
          {
            label: "Average score",
            value: quiz.averagePercent == null ? "\u2014" : `${Math.round(quiz.averagePercent)}%`,
          },
        ]
      : [];

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Account"
        description="Manage your personal information, security, preferences and notifications."
      />

      <div className="space-y-6">
          {/* ------------------------------ overview ------------------------------ */}
          <section aria-labelledby="overview-heading">
            <Card className="overflow-hidden">
              <div className="relative h-28 overflow-hidden bg-gradient-to-r from-primary via-[#5b3fb0] to-navy sm:h-32">
                <span aria-hidden="true" className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10" />
                <span aria-hidden="true" className="absolute right-24 top-14 h-24 w-24 rounded-full bg-white/10" />
                <span aria-hidden="true" className="absolute -left-8 bottom-[-3rem] h-32 w-32 rounded-full bg-white/5" />
              </div>

              <div className="px-5 pb-6 sm:px-7">
                <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="relative shrink-0 self-start">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt=""
                        className="h-24 w-24 rounded-2xl object-cover shadow-md ring-4 ring-white dark:ring-slate-900"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid h-24 w-24 place-items-center rounded-2xl bg-navy text-3xl font-bold text-white shadow-md ring-4 ring-white dark:ring-slate-900"
                      >
                        {initialsOf(user?.name)}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Change profile photo"
                      title="Change profile photo"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                      className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-white shadow-md ring-2 ring-white transition hover:bg-[#6245b7] disabled:cursor-wait dark:ring-slate-900"
                    >
                      {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1 sm:pb-1">
                    <h2 id="overview-heading" className="truncate text-2xl font-bold">
                      {user?.name}
                    </h2>
                    <p className="truncate text-sm muted">{user?.email}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-primary-soft px-2.5 py-1 capitalize text-primary dark:bg-purple-950 dark:text-purple-300">
                    {user?.role}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                    {user?.provider === "google" ? "Signs in with Google" : "Email and password"}
                  </span>
                  {user?.emailVerified === true && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Email verified
                    </span>
                  )}
                  {user?.emailVerified === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      Email not verified
                    </span>
                  )}
                  {joined && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">Member since {joined}</span>
                  )}
                </div>

                {stats.isLoading ? (
                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton key={i} className="h-20" />
                    ))}
                  </div>
                ) : overviewStats.length > 0 ? (
                  <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {overviewStats.map(({ label, value }) => (
                      <div key={label} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                        <dt className="truncate text-xs muted">{label}</dt>
                        <dd className="mt-1 text-2xl font-bold leading-tight">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </Card>
          </section>

          {/* ------------------------- personal information ------------------------- */}
          <SectionCard
            id="personal-info"
            icon={UserRound}
            title="Personal information"
            description="Your name, course and the language you prefer."
          >
            <div className="mb-7 flex items-center gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/50">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                className="group relative shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 text-left shadow-sm transition hover:border-primary hover:shadow-md disabled:cursor-wait dark:border-slate-700 dark:bg-slate-900"
                aria-label="Upload profile photo"
              >
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile photo" className="h-16 w-16 object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center bg-navy text-xl font-bold text-white">
                    {initialsOf(user?.name)}
                  </span>
                )}
                <span className="absolute inset-0 grid place-items-center bg-slate-950/45 text-[10px] font-semibold uppercase tracking-[0.12em] text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Change"}
                </span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="font-semibold">Profile photo</h3>
                <p className="text-xs muted">PNG, JPEG or WebP. It is cropped to a square automatically.</p>
                {photoUrl && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={removePhoto}
                    disabled={photoBusy}
                    className="w-fit px-3 py-2 text-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit(save)} className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="profile-name">
                  Full name
                </label>
                <Input
                  id="profile-name"
                  {...register("name", {
                    required: "Name is required",
                    minLength: { value: 2, message: "Enter at least 2 characters" },
                    maxLength: { value: 100, message: "Use 100 characters or fewer" },
                  })}
                />
                <ErrorText>{errors.name?.message}</ErrorText>
              </div>
              <div>
                <label className="label" htmlFor="profile-email">
                  Email address
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  value={user?.email ?? ""}
                  readOnly
                  disabled
                  aria-describedby="profile-email-hint"
                />
                <p id="profile-email-hint" className="mt-1 text-xs muted">
                  Your email address is your sign-in and can&apos;t be changed here.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="programme">
                  Course or programme
                </label>
                <Input
                  id="programme"
                  {...register("programme", { maxLength: { value: 100, message: "Use 100 characters or fewer" } })}
                />
                <ErrorText>{errors.programme?.message}</ErrorText>
              </div>
              <div>
                <label className="label" htmlFor="profile-language">
                  Preferred language
                </label>
                <select id="profile-language" className="field" {...register("language")}>
                  <option>English</option>
                  <option>Sinhala</option>
                  <option>Tamil</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:col-span-2">
                <p className={cn("text-xs", isDirty ? "font-medium text-amber-600 dark:text-amber-400" : "muted")}>
                  {isDirty ? "You have unsaved changes." : "All changes saved."}
                </p>
                <Button loading={isSubmitting} disabled={!isDirty || isSubmitting}>
                  Save changes
                </Button>
              </div>
            </form>
          </SectionCard>

          {/* -------------------------------- security -------------------------------- */}
          <Security />

          {/* ------------------------------ preferences ------------------------------ */}
          <SectionCard
            id="preferences"
            icon={SlidersHorizontal}
            title="Preferences"
            description="Your preferred language above and the defaults below are pre-selected when you upload a lecture or write a prompt. You can still change them each time."
          >
            <div className="space-y-7">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="font-medium">Colour theme</p>
                    <p className="text-sm muted">Currently using {theme} mode.</p>
                  </div>
                </div>
                <Button variant="secondary" onClick={toggle}>
                  {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  Use {theme === "light" ? "dark" : "light"} mode
                </Button>
              </div>

              <div>
                <p className="label" id="quiz-size-label">
                  Default quiz size
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    role="radiogroup"
                    aria-labelledby="quiz-size-label"
                    className="inline-flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
                  >
                    {QUIZ_SIZES.map((size) => (
                      <button
                        key={size}
                        type="button"
                        role="radio"
                        aria-checked={quizSize === size}
                        onClick={() => setQuizSize(size)}
                        className={cn(
                          "min-h-10 min-w-12 rounded-lg px-4 text-sm font-semibold transition",
                          quizSize === size
                            ? "bg-white text-primary shadow-sm dark:bg-slate-900 dark:text-purple-300"
                            : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm muted">questions per quiz</span>
                </div>
              </div>

              <fieldset>
                <legend className="label">Default outputs</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {OUTPUT_ITEMS.map(({ key, label, hint, icon: Icon }) => {
                    const on = outputs[key];
                    return (
                      <label key={key} className="relative cursor-pointer">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={on}
                          onChange={(event) => setOutputs((current) => ({ ...current, [key]: event.target.checked }))}
                        />
                        <span
                          className={cn(
                            "flex h-full flex-col gap-3 rounded-xl border p-4 transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary",
                            on
                              ? "border-primary bg-primary-soft dark:bg-purple-950/60"
                              : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span
                              className={cn(
                                "grid h-9 w-9 place-items-center rounded-lg",
                                on ? "bg-primary text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800",
                              )}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                "grid h-5 w-5 place-items-center rounded-full border",
                                on ? "border-primary bg-primary text-white" : "border-slate-300 dark:border-slate-600",
                              )}
                            >
                              {on && <Check className="h-3 w-3" />}
                            </span>
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{label}</span>
                            <span className="mt-0.5 block text-xs muted">{hint}</span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <ErrorText>{noOutputs ? "Select at least one default output." : undefined}</ErrorText>
              </fieldset>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                <p className={cn("text-xs", prefsChanged ? "font-medium text-amber-600 dark:text-amber-400" : "muted")}>
                  {prefsChanged ? "You have unsaved changes." : "All changes saved."}
                </p>
                <Button loading={savingPrefs} disabled={savingPrefs || !prefsChanged || noOutputs} onClick={savePreferences}>
                  Save preferences
                </Button>
              </div>
            </div>
          </SectionCard>

          {/* ----------------------------- notifications ----------------------------- */}
          <SectionCard
            id="notifications"
            icon={Bell}
            title="Notifications"
            description="Choose what appears under the bell at the top of the page. Changes are saved as soon as you switch them."
          >
            <div className="space-y-3">
              {NOTIFICATION_ITEMS.map(({ key, label, hint }) => (
                <div
                  key={key}
                  className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-sm muted">{hint}</p>
                  </div>
                  <Switch
                    checked={notif[key]}
                    label={label}
                    disabled={notifSaving}
                    onChange={(value) => void toggleNotification(key, value)}
                  />
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs muted dark:bg-slate-950/50">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Security alerts, such as a password change or signing out on all devices, are always on.
            </p>
          </SectionCard>

          {/* --------------------------- account actions --------------------------- */}
          <SectionCard
            id="account-actions"
            icon={Settings2}
            title="Account actions"
            description="Sign out, take a copy of your data or manage your cookie choices."
          >
            <div className="space-y-3">
              <ActionRow icon={LogOut} title="Sign out" description="End your session on this device.">
                <Button variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              </ActionRow>
              <ActionRow
                icon={Download}
                title="Download my data"
                description="Get a JSON copy of everything stored about your account."
              >
                <Button variant="secondary" loading={busy === "export"} disabled={busy !== null} onClick={handleExport}>
                  <Download className="h-4 w-4" />
                  Download my data
                </Button>
              </ActionRow>
              <ActionRow icon={Cookie} title="Cookie settings" description="Review or change which cookies you allow.">
                <Button variant="secondary" onClick={openCookieSettings}>
                  Cookie settings
                </Button>
              </ActionRow>
            </div>

            {/* danger zone */}
            <div className="mt-7 rounded-2xl border border-red-200 bg-red-50/60 p-5 dark:border-red-900 dark:bg-red-950/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-red-700 dark:text-red-300">Delete account</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Permanently erase your account and everything in it. This cannot be undone.
                  </p>
                </div>
                <Button variant="danger" disabled={confirmingDelete} onClick={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </Button>
              </div>

              {confirmingDelete && (
                <div
                  role="alertdialog"
                  aria-labelledby="delete-account-title"
                  className="mt-5 rounded-xl border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-slate-900"
                >
                  <p id="delete-account-title" className="text-sm font-semibold text-red-700 dark:text-red-300">
                    Permanently delete your account?
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Your account and all of its data will be erased. This cannot be undone.
                  </p>
                  {needsPassword && (
                    <div className="mt-3 max-w-sm">
                      <label className="label" htmlFor="delete-password">
                        Enter your password to confirm
                      </label>
                      <Input
                        id="delete-password"
                        type="password"
                        autoComplete="current-password"
                        value={deletePassword}
                        onChange={(event) => setDeletePassword(event.target.value)}
                      />
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={cancelDelete} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      loading={deleting}
                      disabled={deleting || (needsPassword && !deletePassword)}
                      onClick={handleDeleteAccount}
                    >
                      Yes, delete permanently
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

/** A password input with a show/hide button. */
function PasswordField({
  id,
  label,
  error,
  field,
}: {
  id: string;
  label: string;
  error?: string;
  field: UseFormRegisterReturn;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Input id={id} type={show ? "text" : "password"} className="pr-11" {...field} />
        <button
          type="button"
          aria-label={`${show ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setShow((value) => !value)}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** A four-segment bar that shows how many of the password rules are met. */
function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const passed = [password.length >= 8, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password)].filter(
    Boolean,
  ).length;
  const strong = passed === 4 && password.length >= 12;
  const level =
    passed <= 2
      ? { label: "Weak", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" }
      : passed === 3
        ? { label: "Fair", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" }
        : { label: strong ? "Strong" : "Good", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };

  return (
    <div className="-mt-1" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn("h-1.5 flex-1 rounded-full", segment <= passed ? level.bar : "bg-slate-200 dark:bg-slate-700")}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs muted">
        Password strength: <span className={cn("font-semibold", level.text)}>{level.label}</span>. Use at least 8
        characters with upper and lower case letters and a number.
      </p>
    </div>
  );
}

function Security() {
  const {
    register,
    watch,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ current: string; password: string; confirm: string }>();
  const { user } = useAuth();
  const newPassword = watch("password") ?? "";

  // Google accounts sign in through Google and have no password here to change.
  if (user?.provider === "google") {
    return (
      <SectionCard id="security" icon={Lock} title="Security" description="How you sign in to DocuMind.">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950/50">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="muted">You sign in with Google, so your password is managed by your Google account.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      id="security"
      icon={Lock}
      title="Security"
      description="Keep your account safe with a strong, unique password."
    >
      <h3 className="text-base font-semibold">Change password</h3>
      <p className="mt-1 flex items-center gap-2 text-sm muted">
        <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
        Changing your password signs you out on all your other devices.
      </p>
      <form
        className="mt-6 max-w-lg space-y-4"
        onSubmit={handleSubmit(async (values) => {
          try {
            await changePassword(values.current, values.password);
            toast.success("Password updated. Your other devices have been signed out.");
            reset();
          } catch (err) {
            toast.error(errorMessage(err, "Unable to change your password right now."));
          }
        })}
      >
        <PasswordField
          id="current-password"
          label="Current password"
          error={errors.current?.message}
          field={register("current", { required: "Current password is required" })}
        />
        <PasswordField
          id="profile-new-password"
          label="New password"
          error={errors.password?.message}
          field={register("password", {
            required: "New password is required",
            minLength: { value: 8, message: "Use at least 8 characters" },
            validate: (value) =>
              (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) ||
              "Use uppercase and lowercase letters and a number",
          })}
        />
        <StrengthMeter password={newPassword} />
        <PasswordField
          id="profile-confirm"
          label="Confirm password"
          error={errors.confirm?.message}
          field={register("confirm", {
            required: "Please confirm your new password",
            validate: (v) => v === watch("password") || "Passwords do not match",
          })}
        />
        <Button loading={isSubmitting}>Update password</Button>
      </form>
    </SectionCard>
  );
}
