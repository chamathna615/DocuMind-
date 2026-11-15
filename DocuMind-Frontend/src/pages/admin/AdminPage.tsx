import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  BrainCircuit,
  CircleCheck,
  CircleX,
  Clock3,
  Code,
  Coins,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  Workflow,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import {
  cancelAdminCode,
  cancelAdminDiagram,
  cancelAdminUpload,
  deleteAdminCode,
  deleteAdminDiagram,
  deleteAdminUpload,
  deleteAdminUser,
  getAdminCode,
  getAdminDashboardStats,
  getAdminDiagrams,
  getAdminLogs,
  getAdminUploads,
  getAdminUsers,
  updateAdminUser,
  type AdminGeneration,
  type AdminStats,
  type AdminUpload,
  type AdminUser,
} from '@/api/adminApi'
import type { ActivityLog } from '@/types'
import { Button, Card } from '@/components/ui'
import { EmptyState, ErrorState, LoadingCards, PageHeader, SearchInput, StatusBadge } from '@/components/common/shared'
import { useAuth } from '@/contexts/AuthContext'
import { formatBytes } from '@/utils/helpers'

type BadgeStatus = Parameters<typeof StatusBadge>[0]['status']

// the heading and the one-line description shown above every admin view
const PAGES: Record<string, { title: string; description: string }> = {
  overview: { title: 'Admin overview', description: 'Monitor users, processing activity and platform health.' },
  users: { title: 'User management', description: 'Review accounts, change roles and activate or deactivate access.' },
  uploads: { title: 'Upload management', description: 'Follow every lecture students upload or write, and step in when a job gets stuck.' },
  code: { title: 'Code requests', description: 'See the code students generate, what it costs and which requests failed.' },
  diagrams: { title: 'Diagram requests', description: 'See the diagrams students generate, what they cost and which requests failed.' },
  logs: { title: 'Activity logs', description: 'A trail of sign-ins, uploads and generated content across the platform.' },
}

// shared look of every chart, so the axes, grid and tooltips match from card to card
const AXIS = { axisLine: false, tickLine: false, tick: { fontSize: 12 } } as const
const TOOLTIP = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 } } as const

/** Formats a date from the server. A missing or invalid value shows a dash instead of crashing the page. */
function formatDate(value: string | null | undefined, pattern: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : format(date, pattern)
}

/** "2025-06-03" -> "3 Jun" (the chart labels) */
function dayLabel(day: string) {
  const date = parseISO(day)
  return Number.isNaN(date.getTime()) ? day : format(date, 'd MMM')
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')

export default function AdminPage() {
  const [params] = useSearchParams()
  const view = params.get('view') ?? 'overview'
  const page = PAGES[view] ?? PAGES.overview
  const client = useQueryClient()

  // Only the data of the page that is open is loaded.
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: getAdminDashboardStats, enabled: view === 'overview' })
  const users = useQuery({ queryKey: ['admin-users'], queryFn: getAdminUsers, enabled: view === 'users' })
  const uploads = useQuery({ queryKey: ['admin-uploads'], queryFn: getAdminUploads, enabled: view === 'uploads' })
  const code = useQuery({ queryKey: ['admin-code'], queryFn: getAdminCode, enabled: view === 'code' })
  const diagrams = useQuery({ queryKey: ['admin-diagrams'], queryFn: getAdminDiagrams, enabled: view === 'diagrams' })
  const logs = useQuery({ queryKey: ['admin-logs'], queryFn: getAdminLogs, enabled: view === 'logs' })

  // After any change, every admin list (and the overview numbers) is loaded again.
  const refreshAll = () => {
    for (const key of ['admin-stats', 'admin-users', 'admin-uploads', 'admin-code', 'admin-diagrams', 'admin-logs']) {
      void client.invalidateQueries({ queryKey: [key] })
    }
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title={page.title} description={page.description} />
      {view === 'overview' && <Overview query={stats} />}
      {view === 'users' && <UsersView query={users} onChanged={refreshAll} />}
      {view === 'uploads' && <UploadsView query={uploads} onChanged={refreshAll} />}
      {view === 'code' && <GenerationView kind="code" query={code} onChanged={refreshAll} />}
      {view === 'diagrams' && <GenerationView kind="diagrams" query={diagrams} onChanged={refreshAll} />}
      {view === 'logs' && <LogsView query={logs} />}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function Overview({ query }: { query: UseQueryResult<AdminStats> }) {
  if (query.isLoading) return <LoadingCards />
  if (query.isError || !query.data) return <ErrorState retry={() => void query.refetch()} />

  const stats = query.data
  const usage = stats.usage

  return (
    <>
      <SectionHeading first>Platform summary</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total users" value={stats.totalUsers} icon={Users} />
        <Stat label="Active accounts" value={stats.activeUsers} icon={Activity} accent="green" />
        <Stat label="Total uploads" value={stats.totalUploads} icon={BookOpen} />
        <Stat label="Completed" value={stats.completedJobs} icon={CircleCheck} accent="green" />
        <Stat label="Failed" value={stats.failedJobs} icon={CircleX} accent="red" />
        <Stat label="Average time" value={stats.averageTime} icon={Clock3} accent="amber" />
        <Stat label="Quiz attempts" value={stats.quizAttempts ?? 0} icon={BrainCircuit} />
        <Stat
          label="Average quiz score"
          value={stats.averageQuizPercent == null ? '—' : `${stats.averageQuizPercent}%`}
          icon={Target}
          accent="amber"
        />
      </div>

      <SectionHeading>Activity</SectionHeading>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <ChartCard title="Uploads over time" subtitle="Last seven days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.uploadsOverTime}>
                <defs>
                  <linearGradient id="uploadsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#7457C8" stopOpacity={0.35} />
                    <stop offset="1" stopColor="#7457C8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...AXIS} />
                <YAxis allowDecimals={false} width={32} {...AXIS} />
                <Tooltip {...TOOLTIP} labelFormatter={(label) => dayLabel(String(label))} />
                <Area type="monotone" dataKey="value" name="Uploads" stroke="#7457C8" fill="url(#uploadsFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Processing status" subtitle="All current jobs">
          {stats.statusDistribution.length === 0 ? (
            <div className="grid h-52 place-items-center text-sm muted">No uploads yet.</div>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={82}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {stats.statusDistribution.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
                {stats.statusDistribution.map((d) => (
                  <span key={d.name} className="flex items-center gap-2 text-xs capitalize">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="File type distribution" subtitle="Uploads by file format">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.fileTypeDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="type" {...AXIS} />
                <YAxis allowDecimals={false} width={32} {...AXIS} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="value" name="Uploads" fill="#2563EB" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Quiz attempt trend" subtitle="Last seven days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.quizAttemptTrend}>
                <defs>
                  <linearGradient id="quizFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#15803D" stopOpacity={0.3} />
                    <stop offset="1" stopColor="#15803D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...AXIS} />
                <YAxis allowDecimals={false} width={32} {...AXIS} />
                <Tooltip {...TOOLTIP} labelFormatter={(label) => dayLabel(String(label))} />
                <Area type="monotone" dataKey="value" name="Attempts" stroke="#15803D" fill="url(#quizFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {usage && (
        <>
          <SectionHeading>AI usage (estimated)</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Estimated cost" value={usd(usage.estimatedCostUsd)} icon={Coins} accent="amber" />
            <Stat label="Language model tokens" value={usage.llmInputTokens + usage.llmOutputTokens} icon={Sparkles} />
            <Stat label="Input tokens" value={usage.llmInputTokens} icon={ArrowDownToLine} />
            <Stat label="Output tokens" value={usage.llmOutputTokens} icon={ArrowUpFromLine} />
          </div>
        </>
      )}

      <GenerationOverview stats={stats} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersView({
  query,
  onChanged,
}: {
  query: UseQueryResult<AdminUser[]>
  onChanged: () => void
}) {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')

  const change = useMutation({
    mutationFn: async (action: { work: () => Promise<unknown>; success: string }) => {
      await action.work()
      return action.success
    },
    onSuccess: (success) => {
      toast.success(success)
      onChanged()
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (query.data ?? []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(needle))
  }, [query.data, search])

  if (query.isLoading) return <LoadingCards />
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />

  const ask = (message: string) => window.confirm(message)

  const menuFor = (u: AdminUser) => {
    const items: MenuItem[] = []
    if (u.status === 'active') {
      items.push({
        label: 'Deactivate account',
        onClick: () =>
          ask(`Deactivate ${u.name}? They will be signed out and cannot sign in until you activate the account again.`) &&
          change.mutate({ work: () => updateAdminUser(u.id, { status: 'inactive' }), success: 'Account deactivated' }),
      })
    } else {
      items.push({
        label: 'Activate account',
        onClick: () => change.mutate({ work: () => updateAdminUser(u.id, { status: 'active' }), success: 'Account activated' }),
      })
    }
    items.push(
      u.role === 'student'
        ? {
            label: 'Make administrator',
            onClick: () =>
              ask(`Give ${u.name} full administrator access?`) &&
              change.mutate({ work: () => updateAdminUser(u.id, { role: 'admin' }), success: 'Role changed to admin' }),
          }
        : {
            label: 'Make student',
            onClick: () =>
              ask(`Remove the administrator access of ${u.name}?`) &&
              change.mutate({ work: () => updateAdminUser(u.id, { role: 'student' }), success: 'Role changed to student' }),
          },
    )
    items.push({
      label: 'Delete user',
      danger: true,
      onClick: () =>
        ask(`Permanently delete ${u.name} and ALL of their lectures, quizzes, code and diagrams? This cannot be undone.`) &&
        change.mutate({ work: () => deleteAdminUser(u.id), success: 'User deleted' }),
    })
    return items
  }

  return (
    <>
      <div className="mb-4 w-full sm:max-w-sm">
        <SearchInput value={search} onChange={setSearch} placeholder="Search users" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching users' : 'No users yet'}
          description={search ? 'Try a different name or email address.' : 'Accounts will be listed here once people register.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveData
            headers={['Name', 'Role', 'Status', 'Activity', 'Joined', 'Last active', 'Actions']}
            rows={filtered.map((u) => [
              <div>
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs muted">{u.email}</p>
              </div>,
              <StatusBadge status={u.role} />,
              <StatusBadge status={u.status} />,
              <ActivityChips user={u} />,
              formatDate(u.joinedAt, 'd MMM yyyy'),
              formatDate(u.lastActive, 'd MMM yyyy'),
              u.id === me?.id ? (
                <span className="text-xs muted">This is you</span>
              ) : (
                <ActionMenu label="Actions" items={menuFor(u)} disabled={change.isPending} />
              ),
            ])}
          />
        </Card>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

const UPLOAD_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const isRunning = (u: AdminUpload) => u.active || u.status === 'uploaded' || u.status === 'processing'

function UploadsView({
  query,
  onChanged,
}: {
  query: UseQueryResult<AdminUpload[]>
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const change = useMutation({
    mutationFn: async (action: { work: () => Promise<unknown>; success: string }) => {
      await action.work()
      return action.success
    },
    onSuccess: (success) => {
      toast.success(success)
      onChanged()
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (query.data ?? []).filter((u) => {
      const matchesText = `${u.title} ${u.filename} ${u.owner?.name ?? ''} ${u.owner?.email ?? ''}`.toLowerCase().includes(needle)
      const matchesStatus = filter === 'all' || (filter === 'running' ? isRunning(u) : u.status === filter)
      return matchesText && matchesStatus
    })
  }, [query.data, search, filter])

  if (query.isLoading) return <LoadingCards />
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />

  const menuFor = (u: AdminUpload) => {
    const items: MenuItem[] = []
    if (isRunning(u)) {
      items.push({
        label: 'Cancel processing',
        onClick: () => change.mutate({ work: () => cancelAdminUpload(u.id), success: 'Upload cancelled' }),
      })
    }
    items.push({
      label: 'Delete upload',
      danger: true,
      onClick: () =>
        window.confirm(`Delete “${u.title}” with its notes and quiz? This cannot be undone.`) &&
        change.mutate({ work: () => deleteAdminUpload(u.id), success: 'Upload deleted' }),
    })
    return items
  }

  return (
    <>
      <FilterBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by title, file or owner"
        filter={filter}
        onFilter={setFilter}
      />
      {filtered.length === 0 ? (
        <EmptyState
          title={query.data?.length ? 'No matching uploads' : 'No uploads yet'}
          description={query.data?.length ? 'Try a different search or status.' : 'Lectures that students upload or write will be listed here.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveData
            headers={['Lecture', 'Owner', 'File', 'Status', 'Progress', 'Created', 'Actions']}
            rows={filtered.map((u) => [
              <div>
                <p className="font-semibold">{u.title}</p>
                <p className="text-xs muted">{u.filename}</p>
                {u.status === 'failed' && u.errorMessage && (
                  <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{u.errorMessage}</p>
                )}
              </div>,
              u.owner ? (
                <div>
                  <p>{u.owner.name}</p>
                  <p className="text-xs muted">{u.owner.email}</p>
                </div>
              ) : (
                <span className="muted">Deleted user</span>
              ),
              u.fileType === 'TEXT' ? 'Prompt' : `${u.fileType} · ${formatBytes(u.fileSize)}`,
              <StatusBadge status={u.status as BadgeStatus} />,
              <ProgressCell value={u.progress} />,
              formatDate(u.uploadedAt, 'd MMM, HH:mm'),
              <ActionMenu label="Actions" items={menuFor(u)} disabled={change.isPending} />,
            ])}
          />
        </Card>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Activity logs                                                       */
/* ------------------------------------------------------------------ */

function LogsView({ query }: { query: UseQueryResult<ActivityLog[]> }) {
  const [search, setSearch] = useState('')
  const [onlyFailed, setOnlyFailed] = useState(false)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (query.data ?? []).filter((l) => {
      if (onlyFailed && l.result !== 'Failed') return false
      return `${l.user} ${l.action} ${l.entity} ${l.details}`.toLowerCase().includes(needle)
    })
  }, [query.data, search, onlyFailed])

  if (query.isLoading) return <LoadingCards />
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-sm sm:flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search the activity log" />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-primary"
            checked={onlyFailed}
            onChange={(e) => setOnlyFailed(e.target.checked)}
          />
          Failed only
        </label>
        <Button variant="secondary" className="sm:ml-auto" loading={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={query.data?.length ? 'No matching entries' : 'No activity yet'}
          description={query.data?.length ? 'Try a different search.' : 'Sign-ins, uploads, generated code and diagrams will appear here.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveData
            headers={['Timestamp', 'User', 'Action', 'Entity', 'Result', 'Details']}
            rows={filtered.map((l) => [
              formatDate(l.timestamp, 'd MMM, HH:mm'),
              l.user,
              l.action,
              l.entity,
              <ResultBadge result={l.result} />,
              <span className="block max-w-md break-words text-xs muted">{l.details}</span>,
            ])}
          />
        </Card>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

// colour of the icon badge on the stat tiles (blue and teal belong to the code and diagram features)
const ACCENTS = {
  purple: 'bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300',
}

/** Small uppercase heading that starts a group of tiles or charts on the overview. */
function SectionHeading({ children, first }: { children: ReactNode; first?: boolean }) {
  return <h2 className={`mb-3 text-sm font-semibold uppercase tracking-wide muted ${first ? '' : 'mt-8'}`}>{children}</h2>
}

function Stat({
  label,
  value,
  icon: Icon,
  accent = 'purple',
  hint,
}: {
  label: string
  value: string | number
  icon: typeof Users
  accent?: keyof typeof ACCENTS
  hint?: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium muted">{label}</p>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ACCENTS[accent]}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {hint && <p className="mt-1 text-xs muted">{hint}</p>}
    </Card>
  )
}

/** A card with a title, a subtitle and room for a chart, so every chart card starts at the same height. */
function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm muted">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </Card>
  )
}

/** The search box and the status filter above the uploads, code and diagram lists. */
function FilterBar({
  search,
  onSearch,
  placeholder,
  filter,
  onFilter,
}: {
  search: string
  onSearch: (value: string) => void
  placeholder: string
  filter: string
  onFilter: (value: string) => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="w-full sm:max-w-sm sm:flex-1">
        <SearchInput value={search} onChange={onSearch} placeholder={placeholder} />
      </div>
      <select className="field sm:w-48" value={filter} onChange={(e) => onFilter(e.target.value)} aria-label="Filter by status">
        {UPLOAD_FILTERS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** A thin progress bar with the percentage next to it. */
function ProgressCell({ value }: { value: number }) {
  const percent = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Processing progress"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-xs font-medium tabular-nums">{percent}%</span>
    </div>
  )
}

/** Success or failure of a logged action, drawn like the other status pills. */
function ResultBadge({ result }: { result: string }) {
  const ok = result === 'Success'
  const Icon = ok ? CircleCheck : CircleX
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {result}
    </span>
  )
}

interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

/**
 * A row menu. It is drawn with fixed positioning (not inside the table), so the table's scroll area and the
 * card's rounded corners can never cut it off, even for the last row.
 */
function ActionMenu({ label, items, disabled }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) close()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggle = () => {
    if (open) return setPosition(null)
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    const right = window.innerWidth - rect.right
    // opens upwards when there is not enough room below the button
    setPosition(window.innerHeight - rect.bottom < 220 ? { bottom: window.innerHeight - rect.top + 4, right } : { top: rect.bottom + 4, right })
  }

  return (
    <>
      <span ref={anchor} className="inline-block">
        <Button variant="ghost" className="min-h-9" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <MoreHorizontal className="h-4 w-4" />
          {label}
        </Button>
      </span>
      {position && (
        <div
          ref={panel}
          role="menu"
          style={{ position: 'fixed', top: position.top, bottom: position.bottom, right: position.right }}
          className="z-50 w-52 rounded-xl border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setPosition(null)
                item.onClick()
              }}
              className={`flex min-h-10 w-full items-center rounded-lg px-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${item.danger ? 'text-red-600 dark:text-red-400' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function ResponsiveData({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  // the Actions column sits at the right edge of the table
  const isActions = (header: string) => header === 'Actions'
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col" className={`whitespace-nowrap px-4 py-3 font-semibold ${isActions(h) ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-3 align-middle ${typeof cell === 'string' ? 'whitespace-nowrap' : ''} ${isActions(headers[j]) ? 'text-right' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
        {rows.map((row, i) => (
          <article key={i} className="p-4">
            {row.map((cell, j) => (
              <div key={j} className="flex items-start justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-xs muted">{headers[j]}</span>
                <span className="min-w-0 break-words text-right">{cell}</span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Code and diagram generation                                         */
/* ------------------------------------------------------------------ */

// one colour per feature, used by the chart, the cost bars and the badges
const FEATURES = [
  { key: 'lectures', label: 'Lectures', color: '#7457C8' },
  { key: 'code', label: 'Code', color: '#2563EB' },
  { key: 'diagrams', label: 'Diagrams', color: '#0D9488' },
] as const

// small amounts must not be shown as $0.00
const usd = (value: number) => `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`

/** Overview section: how much the code and diagram tools are used, what they cost, and how that compares. */
function GenerationOverview({ stats }: { stats: AdminStats }) {
  const byFeature = stats.byFeature
  const failedCode = stats.failedCodeRequests ?? 0
  const failedDiagrams = stats.failedDiagramRequests ?? 0
  const failedText = (count: number) => (count === 0 ? 'No failures' : `${count} failed`)

  const codeByDay = new Map((stats.codeOverTime ?? []).map((row) => [row.day, row.value]))
  const diagramsByDay = new Map((stats.diagramOverTime ?? []).map((row) => [row.day, row.value]))
  const activity = stats.uploadsOverTime.map((row) => ({
    day: row.day,
    Lectures: row.value,
    Code: codeByDay.get(row.day) ?? 0,
    Diagrams: diagramsByDay.get(row.day) ?? 0,
  }))

  const totalCost = FEATURES.reduce((sum, feature) => sum + (byFeature?.[feature.key].costUsd ?? 0), 0)

  return (
    <>
      <SectionHeading>Code &amp; diagram generation</SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Code requests" value={stats.codeRequests ?? 0} icon={Code} accent="blue" hint={failedText(failedCode)} />
        <Stat label="Diagram requests" value={stats.diagramRequests ?? 0} icon={Workflow} accent="teal" hint={failedText(failedDiagrams)} />
        <Stat
          label="Code cost (estimated)"
          value={usd(byFeature?.code.costUsd ?? 0)}
          icon={Coins}
          accent="blue"
          hint={`${(byFeature?.code.tokens ?? 0).toLocaleString()} tokens`}
        />
        <Stat
          label="Diagram cost (estimated)"
          value={usd(byFeature?.diagrams.costUsd ?? 0)}
          icon={Coins}
          accent="teal"
          hint={`${(byFeature?.diagrams.tokens ?? 0).toLocaleString()} tokens`}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
        <ChartCard title="Generation activity" subtitle="New lectures, code and diagrams per day, last seven days">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={dayLabel} {...AXIS} />
                <YAxis allowDecimals={false} width={32} {...AXIS} />
                <Tooltip {...TOOLTIP} labelFormatter={(label) => dayLabel(String(label))} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {FEATURES.map((feature) => (
                  <Bar key={feature.key} dataKey={feature.label} fill={feature.color} radius={[6, 6, 0, 0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Estimated cost by feature" subtitle="Share of the total AI spend">
          <div className="space-y-5">
            {FEATURES.map((feature) => {
              const row = byFeature?.[feature.key]
              const share = totalCost > 0 ? ((row?.costUsd ?? 0) / totalCost) * 100 : 0
              return (
                <div key={feature.key}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: feature.color }} />
                      {feature.label}
                    </span>
                    <span className="font-semibold">{usd(row?.costUsd ?? 0)}</span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                    role="progressbar"
                    aria-label={`${feature.label} share of the cost`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(share)}
                  >
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${share}%`, backgroundColor: feature.color }} />
                  </div>
                  <p className="mt-1.5 text-xs muted">
                    {(row?.requests ?? 0).toLocaleString()} requests · {(row?.tokens ?? 0).toLocaleString()} tokens
                  </p>
                </div>
              )
            })}
          </div>
        </ChartCard>
      </div>
    </>
  )
}

/** Per person: how many lectures, code requests and diagrams they created. */
function ActivityChips({ user }: { user: AdminUser }) {
  const items = [
    { icon: BookOpen, count: user.uploadCount, label: 'lectures', className: ACCENTS.purple },
    { icon: Code, count: user.codeCount ?? 0, label: 'code requests', className: ACCENTS.blue },
    { icon: Workflow, count: user.diagramCount ?? 0, label: 'diagrams', className: ACCENTS.teal },
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ icon: Icon, count, label, className }) => (
        <span
          key={label}
          title={`${count} ${label}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className} ${count === 0 ? 'opacity-50' : ''}`}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
          {count}
          <span className="sr-only"> {label}</span>
        </span>
      ))}
    </div>
  )
}

const GENERATION_STATUS: Record<string, { label: string; icon: typeof Clock3; className: string }> = {
  completed: { label: 'Completed', icon: CircleCheck, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  failed: { label: 'Failed', icon: CircleX, className: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  cancelled: { label: 'Cancelled', icon: CircleX, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  processing: { label: 'Writing', icon: Clock3, className: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' },
  queued: { label: 'Queued', icon: Clock3, className: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
}

function GenerationStatus({ status }: { status: string }) {
  const style = GENERATION_STATUS[status] ?? GENERATION_STATUS.queued
  const Icon = style.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {GENERATION_STATUS[status] ? style.label : status}
    </span>
  )
}

const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence',
  class: 'Class',
  state: 'State',
  er: 'ER diagram',
  gantt: 'Gantt',
  mindmap: 'Mind map',
  timeline: 'Timeline',
  pie: 'Pie chart',
  journey: 'User journey',
}

type GenerationKind = 'code' | 'diagrams'

const GENERATION_CONFIG = {
  code: {
    noun: 'code request',
    accent: 'blue' as const,
    icon: Code,
    kindHeader: 'Language',
    emptyText: 'Code that students generate will be listed here.',
    cancel: cancelAdminCode,
    remove: deleteAdminCode,
  },
  diagrams: {
    noun: 'diagram request',
    accent: 'teal' as const,
    icon: Workflow,
    kindHeader: 'Diagram',
    emptyText: 'Diagrams that students generate will be listed here.',
    cancel: cancelAdminDiagram,
    remove: deleteAdminDiagram,
  },
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Python" for a code request, "Flowchart · standard" for a diagram request. */
function kindLabel(kind: GenerationKind, item: AdminGeneration) {
  if (kind === 'code') {
    return !item.programmingLanguage || item.programmingLanguage === 'auto' ? 'Auto-detect' : item.programmingLanguage
  }
  const type = !item.diagramType || item.diagramType === 'auto' ? 'Auto-detect' : (DIAGRAM_TYPE_LABELS[item.diagramType] ?? item.diagramType)
  return item.detail ? `${type} · ${capitalize(item.detail)}` : type
}

const isGenerating = (item: AdminGeneration) => item.active || item.status === 'queued' || item.status === 'processing'

/** The list of "Generate code" or "Generate diagram" requests of all students (same layout as the uploads). */
function GenerationView({
  kind,
  query,
  onChanged,
}: {
  kind: GenerationKind
  query: UseQueryResult<AdminGeneration[]>
  onChanged: () => void
}) {
  const config = GENERATION_CONFIG[kind]
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const change = useMutation({
    mutationFn: async (action: { work: () => Promise<unknown>; success: string }) => {
      await action.work()
      return action.success
    },
    onSuccess: (success) => {
      toast.success(success)
      onChanged()
    },
    onError: (error) => toast.error(errorText(error)),
  })

  const items = query.data ?? []
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesText = `${item.title} ${item.owner?.name ?? ''} ${item.owner?.email ?? ''}`.toLowerCase().includes(needle)
      const matchesStatus = filter === 'all' || (filter === 'running' ? isGenerating(item) : item.status === filter)
      return matchesText && matchesStatus
    })
  }, [items, search, filter])

  if (query.isLoading) return <LoadingCards />
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />

  const running = items.filter(isGenerating).length
  const failed = items.filter((item) => item.status === 'failed').length
  const totalCost = items.reduce((sum, item) => sum + item.costUsd, 0)
  const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0)

  const menuFor = (item: AdminGeneration) => {
    const actions: MenuItem[] = []
    if (isGenerating(item)) {
      actions.push({
        label: 'Cancel generation',
        onClick: () => change.mutate({ work: () => config.cancel(item.id), success: `${capitalize(config.noun)} cancelled` }),
      })
    }
    actions.push({
      label: `Delete ${config.noun}`,
      danger: true,
      onClick: () =>
        window.confirm(`Delete “${item.title}”? This cannot be undone.`) &&
        change.mutate({ work: () => config.remove(item.id), success: `${capitalize(config.noun)} deleted` }),
    })
    return actions
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Requests" value={items.length} icon={config.icon} accent={config.accent} hint="Newest 300 shown" />
        <Stat label="In progress" value={running} icon={Clock3} accent={config.accent} />
        <Stat label="Failed" value={failed} icon={CircleX} accent={config.accent} />
        <Stat
          label="Estimated cost"
          value={usd(totalCost)}
          icon={Coins}
          accent={config.accent}
          hint={`${totalTokens.toLocaleString()} tokens`}
        />
      </div>

      <FilterBar search={search} onSearch={setSearch} placeholder="Search by title or owner" filter={filter} onFilter={setFilter} />

      {filtered.length === 0 ? (
        <EmptyState
          title={items.length ? `No matching ${config.noun}s` : `No ${config.noun}s yet`}
          description={items.length ? 'Try a different search or status.' : config.emptyText}
        />
      ) : (
        <Card className="overflow-hidden">
          <ResponsiveData
            headers={['Request', 'Owner', config.kindHeader, 'Status', 'Tokens', 'Cost', 'Created', 'Actions']}
            rows={filtered.map((item) => [
              <div>
                <p className="max-w-xs font-semibold">{item.title}</p>
                <p className="text-xs muted">Explanations in {item.language}</p>
                {item.status === 'failed' && item.errorMessage && (
                  <p className="mt-1 max-w-xs text-xs text-red-600 dark:text-red-400">{item.errorMessage}</p>
                )}
              </div>,
              item.owner ? (
                <div>
                  <p>{item.owner.name}</p>
                  <p className="text-xs muted">{item.owner.email}</p>
                </div>
              ) : (
                <span className="muted">Deleted user</span>
              ),
              <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${ACCENTS[config.accent]}`}>
                {kindLabel(kind, item)}
              </span>,
              <GenerationStatus status={item.status} />,
              item.tokens.toLocaleString(),
              usd(item.costUsd),
              formatDate(item.createdAt, 'd MMM, HH:mm'),
              <ActionMenu label="Actions" items={menuFor(item)} disabled={change.isPending} />,
            ])}
          />
        </Card>
      )}
    </>
  )
}
