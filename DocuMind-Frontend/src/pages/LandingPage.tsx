import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Code,
  Download,
  FileAudio,
  FileText,
  Plus,
  Workflow,
} from 'lucide-react'
import { PublicNavbar } from '@/components/layout/PublicNavbar'
import { CookieConsent } from '@/components/common/CookieConsent'
import { openCookieSettings } from '@/utils/cookieConsent'

// the lecture tools
const features = [
  ['Lecture content capture', 'Turn MP3, MP4, and PDF lecture material into searchable learning content.', FileAudio],
  ['Smart summary notes', 'Find the important ideas without replaying the whole lecture.', FileText],
  ['Interactive quizzes', 'Check understanding with MCQ and short-answer practice.', BrainCircuit],
  ['Structured study guides', 'Follow clear objectives, examples and revision checklists.', BookOpenCheck],
  ['Learning materials', 'Keep each lecture’s resources organised and downloadable.', Download],
] as const

// the two generators
const generators = [
  {
    title: 'Generate code',
    icon: Code,
    summary: 'Describe what you need in plain words. Working code appears section by section while you watch.',
  },
  {
    title: 'Generate diagrams',
    icon: Workflow,
    summary: 'Turn a process, system or idea into a clean diagram, with a short explanation next to it.',
  },
] as const

// one workflow for everything the app does
const steps = [
  ['01', 'Start', 'Upload a recording, write a prompt, or describe the code or diagram you need.'],
  ['02', 'Generate', 'Follow live progress while your notes, code or diagram are written.'],
  ['03', 'Learn and refine', 'Read notes, take quizzes, adjust the options, or let AI fix a diagram.'],
  ['04', 'Save and download', 'Download study materials, code files and diagrams. Everything stays in your history.'],
] as const

// frequently asked questions about the three things the app does
const faqs = [
  {
    question: 'How do I turn a lecture recording into study material?',
    answer:
      'Upload an MP3, MP4 or PDF, or write a prompt. You get summary notes, a study guide, a searchable transcript and a quiz, and you can follow the progress live while they are being created.',
  },
  {
    question: 'How do I generate code?',
    answer:
      'Describe the program you need in plain words and choose a language, or let it be detected for you. You can add an explanation, example usage and unit tests, get the explanation in English, Sinhala or Tamil, and copy the code or download it as a code file or Markdown.',
  },
  {
    question: 'How do I create a diagram?',
    answer:
      'Describe a process, system or idea and pick one of ten diagram types, or let it be detected. Set the level of detail from simple to detailed, then copy or download the result as SVG, PNG or Mermaid code. If a diagram does not draw correctly, Fix with AI repairs it with one click.',
  },
] as const

/** The frequently asked questions: one row per question, opened with the plus icon (one open at a time). */
function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="mx-auto mt-12 max-w-4xl">
      {faqs.map(({ question, answer }, index) => {
        const isOpen = open === index
        const triggerId = `faq-trigger-${index}`
        const panelId = `faq-panel-${index}`
        return (
          <div key={question} className="border-b border-slate-300 dark:border-slate-700">
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-6 px-5 py-8 text-left text-lg font-normal text-ink hover:text-primary dark:text-white dark:hover:text-purple-300"
              >
                {question}
                <Plus
                  className={`h-6 w-6 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              aria-hidden={!isOpen}
              className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="overflow-hidden">
                <p className="max-w-3xl px-5 pb-8 leading-7 text-slate-600 dark:text-slate-300">{answer}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-white dark:bg-slate-950">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <PublicNavbar />
      <main id="main-content">
        {/* ------------------------------ Hero ------------------------------ */}
        <section className="relative">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_20%,#f1ecff_0,transparent_35%),radial-gradient(circle_at_10%_80%,#eff6ff_0,transparent_30%)] dark:opacity-10" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary dark:bg-purple-950 dark:text-purple-300">
                Study smarter from every lecture
              </span>
              <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-navy dark:text-white sm:text-5xl lg:text-6xl">
                Your lecture, transformed into a complete <span className="text-primary">study kit.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                Upload a recording and get clear notes, a guided tutorial, a searchable transcript, and a quiz made for
                active revision. Need code or a diagram too? Just describe it, in the same workspace.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white shadow-lg shadow-purple-200 hover:bg-[#6245b7] dark:shadow-none"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-ink hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  Sign in
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                {['MP3 & MP4', 'Code & diagrams', 'Built for students'].map((x) => (
                  <span key={x} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {x}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-lg" aria-label="Interactive 3D scene">
              <div className="absolute -inset-8 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative h-[360px] overflow-hidden rounded-2xl sm:h-[460px]">
                <spline-viewer
                  className="block h-full w-full"
                  loading-anim-type="none"
                  url="https://prod.spline.design/QdHEf83LoMvg8B5W/scene.splinecode"
                ></spline-viewer>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------- Lecture tools --------------------------- */}
        <section id="features" className="scroll-mt-16 bg-slate-50 py-20 dark:bg-slate-900/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-widest text-primary">Everything in one place</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">From long recording to focused revision</h2>
              <p className="mt-4 muted">Designed around the way university students actually study.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              {features.map(([title, text, Icon]) => (
                <article key={title} className="surface p-5">
                  <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary dark:bg-purple-950">
                    <Icon />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 muted">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------ Generate code & diagrams ------------------------ */}
        <section id="generate" className="scroll-mt-16 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-widest text-primary">Beyond lectures</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Need code or a diagram? Just describe it.</h2>
              <p className="mt-4 muted">
                The workspace that turns lectures into notes also writes code and draws diagrams, so you do not need
                another tool for your assignments and revision.
              </p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {generators.map(({ title, icon: Icon, summary }) => (
                <article key={title} className="surface p-6 sm:p-8">
                  <div className="flex items-center gap-4">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary dark:bg-purple-950 dark:text-purple-300">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="text-xl font-bold">{title}</h3>
                  </div>
                  <p className="mt-4 leading-7 muted">{summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------ Workflow ------------------------------ */}
        <section id="how" className="scroll-mt-16 bg-slate-50 py-20 dark:bg-slate-900/40">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <p className="text-sm font-bold uppercase tracking-widest text-primary">A simple workflow</p>
            <h2 className="mt-3 text-3xl font-bold">Four steps from idea to revision</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm muted">
              Lectures, code and diagrams all follow the same path, so there is only one thing to learn.
            </p>

            <div className="mt-12 grid gap-8 text-left md:grid-cols-4">
              {steps.map(([n, t, d]) => (
                <div key={n}>
                  <span className="text-sm font-bold text-primary">{n}</span>
                  <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                  <p className="mt-1 text-sm muted">{d}</p>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* --------------------------------- FAQ --------------------------------- */}
        <section id="faq" className="scroll-mt-16 bg-[#f9f6f2] py-20 dark:bg-slate-900/40">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight text-ink dark:text-white sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <FaqAccordion />
          </div>
        </section>

        {/* ------------------------------ Call to action ------------------------------ */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <div className="rounded-3xl bg-navy px-6 py-12 text-white sm:px-12">
              <h2 className="text-3xl font-bold">Ready to make your next lecture easier?</h2>
              <p className="mx-auto mt-3 max-w-xl text-blue-100">
                Create your learning workspace and try the complete flow: notes, quizzes, code and diagrams.
              </p>
              <Link
                to="/register"
                className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-navy hover:bg-blue-50"
              >
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 py-8 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 text-sm muted sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 LectureLens · University project demonstration</span>
          <span className="flex gap-5">
            <Link to="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
            <button type="button" onClick={openCookieSettings} className="hover:underline">
              Cookie settings
            </button>
            <a href="mailto:project@example.com">Contact</a>
          </span>
        </div>
      </footer>
      <CookieConsent />
    </div>
  )
}
