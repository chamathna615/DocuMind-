import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearNotifications,
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationList,
  type NotificationType,
} from "@/api/notificationApi";
import { Skeleton } from "@/components/ui";
import { cn } from "@/utils/helpers";

const QUERY_KEY = ["notifications"];

const typeStyle: Record<NotificationType, { Icon: LucideIcon; className: string }> = {
  ready: { Icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  failed: { Icon: AlertTriangle, className: "text-red-600 dark:text-red-400" },
  weekly: { Icon: BarChart3, className: "text-primary" },
  security: { Icon: ShieldCheck, className: "text-amber-600 dark:text-amber-400" },
};

function timeAgo(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatDistanceToNow(date, { addSuffix: true });
}

/**
 * The bell in the top bar: a real unread badge, a list of the student's notifications,
 * mark-as-read / delete, and a link to the notification settings on the Account page.
 */
export function NotificationBell({ settingsHref }: { settingsHref?: string }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const client = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getNotifications,
    refetchInterval: 60_000, // new "ready" / "failed" notices show up without reloading the page
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  const items = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  // Always show fresh data when the panel is opened.
  useEffect(() => {
    if (open) void client.invalidateQueries({ queryKey: QUERY_KEY });
  }, [open, client]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The list updates instantly; if the server refuses, the real state is loaded again.
  const patch = (change: (list: NotificationList) => NotificationList) =>
    client.setQueryData<NotificationList>(QUERY_KEY, (old) => (old ? change(old) : old));
  const recover = (error: unknown) => {
    toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    void client.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const openItem = (item: AppNotification) => {
    if (!item.read) {
      patch((list) => ({
        notifications: list.notifications.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
        unread: Math.max(0, list.unread - 1),
      }));
      markNotificationRead(item.id).catch(recover);
    }
    if (item.lectureId) {
      setOpen(false);
      nav(`/processing/${item.lectureId}`);
    }
  };

  const markAll = async () => {
    patch((list) => ({ notifications: list.notifications.map((n) => ({ ...n, read: true })), unread: 0 }));
    try {
      await markAllNotificationsRead();
    } catch (error) {
      recover(error);
    }
  };

  const remove = async (item: AppNotification) => {
    patch((list) => ({
      notifications: list.notifications.filter((n) => n.id !== item.id),
      unread: item.read ? list.unread : Math.max(0, list.unread - 1),
    }));
    try {
      await deleteNotification(item.id);
    } catch (error) {
      recover(error);
    }
  };

  const clearAll = async () => {
    patch(() => ({ notifications: [], unread: 0 }));
    try {
      await clearNotifications();
    } catch (error) {
      recover(error);
    }
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        {unread > 0 && <span className="sr-only">{unread} unread</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="surface fixed inset-x-4 top-[4.25rem] z-50 flex max-h-[70vh] flex-col overflow-hidden shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold">
              Notifications
              {unread > 0 && <span className="ml-2 text-xs font-medium text-primary">{unread} new</span>}
            </h2>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <CheckCheck className="h-4 w-4" />
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-sm">
                <p className="muted">Notifications could not be loaded.</p>
                <button type="button" onClick={() => void refetch()} className="mt-2 font-semibold text-primary">
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <BellOff className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">You&apos;re all caught up</p>
                <p className="mt-1 text-sm muted">
                  We&apos;ll let you know when your learning materials are ready or if something goes wrong.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => {
                  const { Icon, className } = typeStyle[item.type] ?? typeStyle.security;
                  return (
                    <li key={item.id} className="flex items-start gap-1 pr-2">
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn("block truncate text-sm", item.read ? "font-medium" : "font-semibold")}>
                              {item.title}
                            </span>
                            {!item.read && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                            )}
                          </span>
                          {item.message && <span className="mt-0.5 block text-sm muted">{item.message}</span>}
                          <span className="mt-1 block text-xs muted">{timeAgo(item.createdAt)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        aria-label={`Delete notification: ${item.title}`}
                        className="mt-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {settingsHref && (
            <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              <Link
                to={settingsHref}
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Notification settings
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
