import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, Braces, Download, FileCheck2, FileQuestion, FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadLectureFile,
  getLecture,
  regenerateLecture,
  type DownloadKind,
  type LectureOutput,
} from '@/api/lectureApi'
import { Button, Card, Skeleton } from '@/components/ui'
import { PageHeader } from '@/components/common/shared'

interface FileItem {
  kind: DownloadKind
  name: string
  type: 'PDF' | 'ZIP' | 'JSON'
  slug: string
  icon: typeof FileText
  needs: LectureOutput | null // null = always available once something exists
}

const FILES: FileItem[] = [
  { kind: 'notes', name: 'Summary Notes', type: 'PDF', slug: 'notes.pdf', icon: FileText, needs: 'notes' },
  { kind: 'tutorial', name: 'Tutorial / Study Guide', type: 'PDF', slug: 'study-guide.pdf', icon: FileCheck2, needs: 'tutorial' },
  { kind: 'quiz', name: 'Quiz', type: 'PDF', slug: 'quiz.pdf', icon: FileQuestion, needs: 'quiz' },
  { kind: 'answer-key', name: 'Quiz Answer Key', type: 'PDF', slug: 'quiz-answer-key.pdf', icon: FileCheck2, needs: 'quiz' },
  { kind: 'json', name: 'Structured Data (JSON)', type: 'JSON', slug: 'structured.json', icon: Braces, needs: null },
  { kind: 'pack', name: 'Complete Study Pack', type: 'ZIP', slug: 'study-pack.zip', icon: Archive, needs: null },
]

export default function DownloadsPage() {
  const { uploadId = '' } = useParams()
  const nav = useNavigate()
  const client = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['lecture', uploadId], queryFn: () => getLecture(uploadId) })
  const [busy, setBusy] = useState('')
  const [regenerating, setRegenerating] = useState(false)

  if (isLoading) return <Skeleton className="h-[500px]" />

  const ready = data?.status === 'completed'
  const wanted = (data?.outputs ?? []) as string[]
  const visible = FILES.filter((f) => f.needs === null || wanted.includes(f.needs))

  const download = async (file: FileItem) => {
    setBusy(file.kind)
    try {
      await downloadLectureFile(uploadId, file.kind, `${data?.title || 'lecture'}-${file.slug}`)
      toast.success(`${file.name} downloaded`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed. Please try again.')
    } finally {
      setBusy('')
    }
  }

  const regenerate = async () => {
    if (!window.confirm('Generate new notes, quiz and study guide from this lecture? The current versions will be replaced.')) return
    setRegenerating(true)
    try {
      client.setQueryData(['lecture', uploadId], await regenerateLecture(uploadId))
      await client.invalidateQueries({ queryKey: ['quiz', uploadId] })
      nav(`/processing/${uploadId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start regeneration')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Learning materials"
        title="Download centre"
        description={`Choose individual files or download the complete study pack for ${data?.title}.`}
        action={
          <Button disabled={!ready} loading={busy === 'pack'} onClick={() => download(FILES.find((f) => f.kind === 'pack') ?? FILES[FILES.length - 1])}>
            <Download className="h-4 w-4" />
            Download all
          </Button>
        }
      />

      {!ready && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          These files are not ready yet.{' '}
          <Link to={`/processing/${uploadId}`} className="font-semibold underline">
            Check the progress
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((file) => {
          const Icon = file.icon
          return (
            <Card key={file.kind} className="p-5">
              <div className="flex items-start justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary dark:bg-purple-950">
                  <Icon />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  {ready ? 'Available' : 'Not ready'}
                </span>
              </div>
              <h2 className="mt-5 font-semibold">{file.name}</h2>
              <p className="mt-1 text-sm muted">
                {file.type} · created from your saved results when you download
              </p>
              <Button
                variant="secondary"
                className="mt-5 w-full"
                disabled={!ready}
                loading={busy === file.kind}
                onClick={() => download(file)}
              >
                <Download className="h-4 w-4" />
                Download {file.type}
              </Button>
            </Card>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="font-semibold">Want fresh results?</h2>
          <p className="mt-1 text-sm muted">
            Regenerates the notes, quiz and study guide from the saved lecture text. No new upload needed.
          </p>
        </div>
        <Button variant="secondary" loading={regenerating} disabled={!data || Boolean(data.active)} onClick={regenerate}>
          <RefreshCw className="h-4 w-4" />
          Regenerate files
        </Button>
      </div>

      <Link to="/dashboard" className="mt-6 inline-block text-sm font-semibold text-primary">
        ← Back to dashboard
      </Link>
    </>
  )
}
