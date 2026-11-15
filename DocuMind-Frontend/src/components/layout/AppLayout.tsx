import { Fragment, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  Code,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Upload,
  User,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { AppLogo } from "@/components/common/AppLogo";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { CookieConsent } from "@/components/common/CookieConsent";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/utils/helpers";

const studentLinks = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/profile", "Account", User],
] as const;
const adminLinks = [
  ["/admin", "Overview", BarChart3],
  ["/admin?view=users", "Users", Users],
  ["/admin?view=uploads", "Uploads", BookOpen],
  ["/admin?view=code", "Code requests", Code],
  ["/admin?view=diagrams", "Diagram requests", Workflow],
  ["/admin?view=logs", "Activity logs", ClipboardList],
] as const;

// All admin links share the path /admin, so the "?view=" part decides which one is the open page.
const adminActive = (to: string, pathname: string, search: string) => {
  const [path, query = ""] = to.split("?");
  if (pathname !== path) return false;
  const wanted = new URLSearchParams(query).get("view") ?? "overview";
  const current = new URLSearchParams(search).get("view") ?? "overview";
  return wanted === current;
};
export function AppLayout({ admin = false }: { admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [uploadChoicesOpen, setUploadChoicesOpen] = useState(false);
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const links = admin ? adminLinks : studentLinks;
  const logout = () => {
    signOut();
    nav("/");
  };
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 bg-white transition-[width,transform] dark:border-slate-800 dark:bg-slate-900",
          collapsed ? "w-20" : "w-64",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <AppLogo compact={collapsed} />
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden"
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {links.map(([to, label, Icon]) => (
            <Fragment key={label}>
              {!admin && to === "/profile" && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadChoicesOpen(true);
                    setOpen(false);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Upload className="h-5 w-5 shrink-0" />
                  {!collapsed && "generate content"}
                </button>
              )}
              {!admin && to === "/profile" && (
                <NavLink
                  to="/generate-code"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                      isActive
                        ? "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )
                  }
                >
                  <Code className="h-5 w-5 shrink-0" />
                  {!collapsed && "generate code"}
                </NavLink>
              )}
              {!admin && to === "/profile" && (
                <NavLink
                  to="/generate-diagram"
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                      isActive
                        ? "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )
                  }
                >
                  <Workflow className="h-5 w-5 shrink-0" />
                  {!collapsed && "generate diagram"}
                </NavLink>
              )}
              <NavLink
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                    (admin ? adminActive(to, location.pathname, location.search) : isActive)
                      ? "bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && label}
              </NavLink>
            </Fragment>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <button
            onClick={logout}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && "Sign out"}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="mt-2 hidden min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-slate-500 hover:bg-slate-100 lg:flex dark:hover:bg-slate-800"
          >
            <ChevronLeft
              className={cn(
                "h-5 w-5 transition-transform",
                collapsed && "rotate-180",
              )}
            />
            {!collapsed && "Collapse sidebar"}
          </button>
        </div>
      </aside>
      {uploadChoicesOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUploadChoicesOpen(false);
          }}
        >
          <div
            className="surface w-full max-w-md p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-choice-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-primary">Create content</p>
                <h2 id="upload-choice-title" className="mt-1 text-xl font-bold">
                  How would you like to start?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setUploadChoicesOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close upload choices"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setUploadChoicesOpen(false);
                  nav("/write-prompt");
                }}
                className="flex min-h-28 flex-col items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-primary hover:bg-primary-soft dark:border-slate-700 dark:hover:bg-purple-950"
              >
                <FileText className="h-6 w-6 text-primary" />
                <span>
                  <span className="block font-semibold">Text</span>
                  <span className="mt-1 block text-sm muted">Write a prompt and generate notes.</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadChoicesOpen(false);
                  nav("/upload");
                }}
                className="flex min-h-28 flex-col items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-primary hover:bg-primary-soft dark:border-slate-700 dark:hover:bg-purple-950"
              >
                <Upload className="h-6 w-6 text-primary" />
                <span>
                  <span className="block font-semibold">Upload lecture</span>
                  <span className="mt-1 block text-sm muted">Upload audio, video, or PDF material.</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className={cn(
          "transition-[padding]",
          collapsed ? "lg:pl-20" : "lg:pl-64",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-xl lg:hidden"
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="hidden lg:block">
            <p className="text-xs muted">
              {admin ? "Administration" : "Student workspace"}
            </p>
            <p className="text-sm font-semibold">AI learning assistant</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell settingsHref={admin ? undefined : "/profile#notifications"} />
            <div className="ml-1 flex items-center gap-2">
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt="Profile photo"
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
                />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                  {user?.name
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                </span>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight">
                  {user?.name}
                </p>
                <p className="text-xs capitalize muted">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8"
        >
          <Outlet />
        </main>
      </div>
      <CookieConsent />
    </div>
  );
}
