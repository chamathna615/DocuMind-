import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Flag,
  RotateCcw,
  Trophy,
  XCircle,
} from 'lucide-react'
import { getLecture } from '@/api/lectureApi'
import { getQuiz, submitQuizAttempt } from '@/api/quizApi'
import { Button, Card, Progress, Skeleton } from '@/components/ui'
import { EmptyState, PageHeader } from '@/components/common/shared'

const answerKey = (id: string) => `lecturelens_quiz_${id}`

function readSavedAnswers(id: string): Record<string, string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(answerKey(id)) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? saved as Record<string, string>
      : {}
  } catch {
    return {}
  }
}

export function QuizPage() {
  const { uploadId = '' } = useParams()
  const nav = useNavigate()
  const lecture = useQuery({ queryKey: ['lecture', uploadId], queryFn: () => getLecture(uploadId) })
  const quiz = useQuery({ queryKey: ['quiz', uploadId], queryFn: () => getQuiz(uploadId) })
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(() => readSavedAnswers(uploadId))
  const [flagged, setFlagged] = useState<string[]>([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    localStorage.setItem(answerKey(uploadId), JSON.stringify(answers))
  }, [answers, uploadId])

  useEffect(() => {
    if (quiz.data && index >= quiz.data.length) setIndex(0)
  }, [index, quiz.data])

  if (quiz.isLoading) return <Skeleton className="h-[600px]" />

  if (quiz.isError) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Practice quiz" title={lecture.data?.title || 'Lecture quiz'} />
        <Card className="p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-7 w-7 text-red-500" />
          <h2 className="font-semibold">We couldn't load this quiz</h2>
          <p className="mb-5 mt-2 text-sm muted">
            {quiz.error instanceof Error ? quiz.error.message : 'Please try again.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => void quiz.refetch()}>Try again</Button>
            <Link to={`/notes/${uploadId}`}><Button>Back to notes</Button></Link>
          </div>
        </Card>
      </div>
    )
  }

  const questions = quiz.data ?? []

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Practice quiz" title={lecture.data?.title || 'Lecture quiz'} />
        <EmptyState
          title="No quiz questions yet"
          description="This lecture does not have any quiz questions available. Return to the lecture materials and try again after the quiz has been generated."
          action={<Link to={`/notes/${uploadId}`}><Button>Back to notes</Button></Link>}
        />
      </div>
    )
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Practice quiz"
          title={lecture.data?.title || 'Lecture quiz'}
          description="A focused knowledge check based on your generated learning materials."
        />
        <Card className="p-6 sm:p-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary dark:bg-purple-950">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="mt-6 text-center">
            <h2 className="text-2xl font-bold">Ready to check your understanding?</h2>
            <p className="mx-auto mt-3 max-w-lg muted">
              Answer at your own pace. Your responses are saved in this browser as you move between questions.
            </p>
          </div>
          <div className="mx-auto mt-7 grid max-w-lg grid-cols-3 gap-3 text-center">
            <Info value={questions.length} label="Questions" />
            <Info value={questions.filter((question) => question.type === 'mcq').length} label="Multiple choice" />
            <Info value="8–10m" label="Estimate" />
          </div>
          <div className="mx-auto mt-7 max-w-lg rounded-xl bg-slate-50 p-4 text-sm leading-6 dark:bg-slate-800">
            <strong>Before you begin:</strong> choose one answer for multiple-choice questions. Short answers are checked against the expected answer.
          </div>
          <Button className="mx-auto mt-7 flex" onClick={() => setStarted(true)}>
            Start quiz <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </div>
    )
  }

  const current = questions[index]

  // Keep the quiz recoverable if the question list changes while it is open.
  if (!current) {
    return <Skeleton className="h-[600px]" />
  }

  const submit = async () => {
    if (!window.confirm('Submit your quiz? You can review unanswered questions first.')) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const result = await submitQuizAttempt(uploadId, answers)
      localStorage.setItem(`${answerKey(uploadId)}_result`, JSON.stringify({ ...result, answers }))
      nav(`/quiz/${uploadId}/results`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'We could not submit your quiz. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={lecture.data?.title}
        title={`Question ${index + 1} of ${questions.length}`}
        description={`${Object.values(answers).filter(Boolean).length} answered · ${flagged.length} flagged`}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_250px]">
        <Card className="p-5 sm:p-8">
          <div className="mb-7">
            <Progress value={((index + 1) / questions.length) * 100} label="Quiz progress" />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary dark:bg-purple-950">
                {current.type === 'mcq' ? 'Multiple choice' : 'Short answer'}
              </span>
              <h2 className="mt-4 text-xl font-semibold leading-8">{current.prompt}</h2>
            </div>
            <button
              onClick={() => setFlagged((previous) => previous.includes(current.id)
                ? previous.filter((id) => id !== current.id)
                : [...previous, current.id])}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${flagged.includes(current.id) ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              aria-label="Flag question"
            >
              <Flag className="h-5 w-5" />
            </button>
          </div>

          {current.type === 'mcq' ? (
            <fieldset className="mt-7 space-y-3">
              <legend className="sr-only">Choose one answer</legend>
              {current.options?.map((option, optionIndex) => (
                <label
                  key={option}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm ${answers[current.id] === option ? 'border-primary bg-primary-soft font-semibold text-primary dark:bg-purple-950' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                >
                  <input
                    type="radio"
                    name={current.id}
                    value={option}
                    checked={answers[current.id] === option}
                    onChange={() => setAnswers((previous) => ({ ...previous, [current.id]: option }))}
                  />
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-xs text-slate-500 dark:bg-slate-900">
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  {option}
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="mt-7">
              <label className="label" htmlFor="short-answer">Your answer</label>
              <textarea
                id="short-answer"
                maxLength={500}
                rows={6}
                className="field resize-y"
                value={answers[current.id] ?? ''}
                onChange={(event) => setAnswers((previous) => ({ ...previous, [current.id]: event.target.value }))}
              />
              <p className="mt-2 text-right text-xs muted">{(answers[current.id] ?? '').length}/500 characters</p>
            </div>
          )}

          {submitError && <p role="alert" className="mt-4 text-sm text-red-600">{submitError}</p>}
          <div className="mt-8 flex justify-between border-t border-slate-200 pt-5 dark:border-slate-800">
            <Button variant="secondary" disabled={index === 0 || submitting} onClick={() => setIndex((previous) => previous - 1)}>
              <ArrowLeft className="h-4 w-4" />Previous
            </Button>
            {index === questions.length - 1 ? (
              <Button loading={submitting} onClick={submit}>Submit quiz</Button>
            ) : (
              <Button disabled={submitting} onClick={() => setIndex((previous) => previous + 1)}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Card>

        <Card className="h-fit p-4">
          <h2 className="font-semibold">Question navigator</h2>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {questions.map((question, questionIndex) => (
              <button
                key={question.id}
                onClick={() => setIndex(questionIndex)}
                aria-label={`Question ${questionIndex + 1}${answers[question.id] ? ', answered' : ''}`}
                className={`grid h-10 w-10 place-items-center rounded-lg text-sm font-semibold ${questionIndex === index ? 'bg-primary text-white' : answers[question.id] ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'} ${flagged.includes(question.id) ? 'ring-2 ring-amber-400' : ''}`}
              >
                {questionIndex + 1}
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs muted dark:border-slate-800">
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-100" />Answered</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded ring-2 ring-amber-400" />Flagged for review</p>
            <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />Answers autosaved</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Info({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs muted">{label}</p>
    </div>
  )
}

interface StoredQuizResult {
  score: number
  total: number
  answers: Record<string, string>
  results?: Array<{
    questionId: string
    prompt: string
    givenAnswer: string
    expectedAnswer: string
    correct: boolean
    explanation: string
  }>
}

export function QuizResultsPage() {
  const { uploadId = '' } = useParams()
  const lecture = useQuery({ queryKey: ['lecture', uploadId], queryFn: () => getLecture(uploadId) })
  let result: StoredQuizResult | null = null
  try {
    result = JSON.parse(localStorage.getItem(`${answerKey(uploadId)}_result`) ?? 'null')
  } catch {
    result = null
  }

  if (!result) {
    return (
      <div>
        <PageHeader eyebrow="Quiz results" title={lecture.data?.title || 'Your quiz performance'} />
        <EmptyState
          title="No quiz results yet"
          description="Complete this lecture's quiz to see your score and review your answers."
          action={<Link to={`/quiz/${uploadId}`}><Button>Open quiz</Button></Link>}
        />
      </div>
    )
  }

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0
  const skipped = result.results
    ? result.results.filter((item) => !item.givenAnswer).length
    : Object.values(result.answers).filter((answer) => !answer).length

  return (
    <>
      <PageHeader
        eyebrow="Quiz results"
        title={lecture.data?.title || 'Your quiz performance'}
        description="Review your score, explanations and next study steps."
        action={(
          <div className="flex gap-2">
            <Link to={`/notes/${uploadId}`}><Button variant="secondary">Return to notes</Button></Link>
            <Link to={`/downloads/${uploadId}`}><Button>Open downloads</Button></Link>
          </div>
        )}
      />
      <div className="grid gap-5 lg:grid-cols-[350px_1fr]">
        <Card className="h-fit p-7 text-center">
          <div className="relative mx-auto grid h-36 w-36 place-items-center rounded-full bg-primary-soft dark:bg-purple-950">
            <div>
              <p className="text-4xl font-extrabold text-primary">{pct}%</p>
              <p className="text-xs muted">Quiz score</p>
            </div>
          </div>
          <h2 className="mt-5 text-xl font-bold">{pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good progress' : 'Keep practising'}</h2>
          <p className="mt-2 text-sm muted">You answered {result.score} of {result.total} questions correctly.</p>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <Info value={result.score} label="Correct" />
            <Info value={result.total - result.score} label="Incorrect" />
            <Info value={skipped} label="Skipped" />
          </div>
          <Link
            to={`/quiz/${uploadId}`}
            onClick={() => {
              localStorage.removeItem(answerKey(uploadId))
              localStorage.removeItem(`${answerKey(uploadId)}_result`)
            }}
          >
            <Button variant="secondary" className="mt-6 w-full"><RotateCcw className="h-4 w-4" />Retry quiz</Button>
          </Link>
        </Card>
        <div>
          <h2 className="mb-4 text-xl font-bold">Question review</h2>
          {result.results?.length ? (
            <div className="space-y-3">
              {result.results.map((item, index) => (
                <Card key={item.questionId} className="p-5">
                  <div className="flex items-start gap-3">
                    {item.correct
                      ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
                    <div>
                      <p className="text-sm font-semibold">{index + 1}. {item.prompt}</p>
                      <p className="mt-3 text-sm"><span className="muted">Your answer:</span> {item.givenAnswer || 'Not answered'}</p>
                      {!item.correct && <p className="mt-1 text-sm"><span className="muted">Expected:</span> {item.expectedAnswer}</p>}
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 muted dark:bg-slate-800">
                        <AlertCircle className="mr-1 inline h-4 w-4" />{item.explanation}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-5 text-sm muted">Question review is unavailable for this saved result.</Card>
          )}
        </div>
      </div>
    </>
  )
}
