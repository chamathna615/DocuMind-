import { useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { FileAudio, FileText, FileVideo, Info, Lock, Trash2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { uploadLecture, type LectureOutput } from '@/api/lectureApi'
import { Button, Card, ErrorText, Input, Progress } from '@/components/ui'
import { PageHeader } from '@/components/common/shared'
import { useAuth } from '@/contexts/AuthContext'
import { formatBytes, validateLectureFile } from '@/utils/helpers'

interface Values {
  title:string
  course:string
  language:string
  notes:boolean
  quiz:boolean
  tutorial:boolean
  questionCount:string
}

function SourceIcon({filename}:{filename:string}) {
  const extension=filename.split('.').pop()?.toLowerCase()
  if(extension==='pdf') return <FileText/>
  if(extension==='mp4') return <FileVideo/>
  return <FileAudio/>
}

export default function UploadPage(){
  const nav=useNavigate()
  const {user}=useAuth()
  // the Account page's saved preferences are the starting point; they can still be changed here
  const prefs=user?.preferences
  const input=useRef<HTMLInputElement>(null)
  const abort=useRef<AbortController|null>(null)
  const [file,setFile]=useState<File|null>(null)
  const [fileError,setFileError]=useState('')
  const [dragging,setDragging]=useState(false)
  const [progress,setProgress]=useState(0)
  const [uploading,setUploading]=useState(false)
  const {register,control,handleSubmit,setError,clearErrors,formState:{errors}}=useForm<Values>({
    defaultValues:{
      title:'',
      course:'',
      language:user?.preferredLanguage??'English',
      notes:prefs?.outputs.notes??true,
      quiz:prefs?.outputs.quiz??true,
      tutorial:prefs?.outputs.tutorial??true,
      questionCount:String(prefs?.quizSize??10),
    },
  })

  const choose=(next?:File)=>{
    if(!next)return
    const error=validateLectureFile(next)
    if(error){setFile(null);setFileError(error);return}
    setFileError('')
    setFile(next)
  }

  const cancelUpload=()=>{
    abort.current?.abort()
    abort.current=null
    setUploading(false)
    setProgress(0)
    toast.info('Upload cancelled')
  }

  const submit=async(v:Values)=>{
    if(!file){setFileError('Choose a lecture recording or PDF first.');return}
    if(!v.notes&&!v.quiz&&!v.tutorial){setError('notes',{message:'Select at least one learning output.'});return}
    clearErrors('notes')

    const outputs:LectureOutput[]=[
      ...(v.notes?['notes' as const]:[]),
      ...(v.quiz?['quiz' as const]:[]),
      ...(v.tutorial?['tutorial' as const]:[]),
    ]

    abort.current=new AbortController()
    setUploading(true)
    setProgress(0)

    try {
      const lecture = await uploadLecture(
        {
          title: v.title.trim(),
          course: v.course.trim(),
          language: v.language,
          questionCount: Number(v.questionCount),
          outputs,
          file,
        },
        { signal: abort.current.signal, onProgress: setProgress },
      )
      toast.success('Upload complete. Generating your learning materials…')
      // NOTE: change this path if your router uses a different URL for ProcessingPage
      nav(`/processing/${lecture.id}`)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      abort.current=null
      setUploading(false)
    }
  }

  return <>
    <PageHeader
      eyebrow="New learning kit"
      title="Upload lecture material"
      description="Add an MP3 or MP4 recording, or upload a PDF document, then choose the materials you want to generate."
    />
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <Card className="p-5 sm:p-7">
        <form onSubmit={handleSubmit(submit)}>
          <div
            onDragOver={event=>{event.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={event=>{event.preventDefault();setDragging(false);choose(event.dataTransfer.files[0])}}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging?'border-primary bg-primary-soft dark:bg-purple-950':'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'}`}
          >
            {file?<div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary dark:bg-purple-950">
                <SourceIcon filename={file.name}/>
              </span>
              <p className="mt-4 break-all font-semibold">{file.name}</p>
              <p className="mt-1 text-sm muted">{file.name.split('.').pop()?.toUpperCase()} · {formatBytes(file.size)}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button type="button" variant="secondary" onClick={()=>input.current?.click()}>Replace file</Button>
                <Button type="button" variant="ghost" className="text-red-600" onClick={()=>setFile(null)}>
                  <Trash2 className="h-4 w-4"/>Remove
                </Button>
              </div>
            </div>:<div>
              <UploadCloud className="mx-auto h-10 w-10 text-primary"/>
              <p className="mt-4 font-semibold">Drag and drop your lecture material here</p>
              <p className="mt-1 text-sm muted">MP3 up to 100 MB · MP4 up to 500 MB · PDF up to 50 MB</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={()=>input.current?.click()}>Browse files</Button>
            </div>}
            <input
              ref={input}
              type="file"
              accept="audio/mpeg,video/mp4,application/pdf,.mp3,.mp4,.pdf"
              className="sr-only"
              onChange={event=>choose(event.target.files?.[0])}
            />
          </div>
          <ErrorText>{fileError}</ErrorText>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Lecture title <span className="text-red-600">*</span></label>
              <Input id="title" placeholder="e.g. Machine Learning — Week 03" {...register('title',{required:'Lecture title is required'})}/>
              <ErrorText>{errors.title?.message}</ErrorText>
            </div>
            <div>
              <label className="label" htmlFor="course">Course or subject</label>
              <Input id="course" placeholder="e.g. Data Science" {...register('course')}/>
            </div>
            <div>
              <label className="label" htmlFor="language">Content language</label>
              <select id="language" className="field" {...register('language')}>
                <option>English</option><option>Sinhala</option><option>Tamil</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="questionCount">Quiz questions</label>
              <select id="questionCount" className="field" {...register('questionCount')}>
                <option>5</option><option>10</option><option>15</option><option>20</option>
              </select>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="font-semibold">Learning outputs <span className="text-red-600">*</span></legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Controller name="notes" control={control} render={({field})=><Option label="Summary notes" checked={field.value} onChange={field.onChange}/>}/>
              <Controller name="quiz" control={control} render={({field})=><Option label="Practice quiz" checked={field.value} onChange={field.onChange}/>}/>
              <Controller name="tutorial" control={control} render={({field})=><Option label="Study guide" checked={field.value} onChange={field.onChange}/>}/>
            </div>
            <ErrorText>{errors.notes?.message}</ErrorText>
          </fieldset>

          {uploading&&<div className="mt-6" aria-live="polite">
            <div className="mb-2 flex justify-between text-sm"><span>{progress<100?'Uploading securely…':'Starting processing…'}</span><span className="font-semibold">{progress}%</span></div>
            <Progress value={progress}/>
            <Button type="button" variant="ghost" className="mt-2" onClick={cancelUpload}>Cancel upload</Button>
          </div>}
          <div className="mt-7 flex justify-end">
            <Button type="submit" loading={uploading}><UploadCloud className="h-4 w-4"/>Upload and generate</Button>
          </div>
        </form>
      </Card>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Info className="h-5 w-5 text-primary"/>Accepted files</h2>
          <ul className="mt-4 space-y-3 text-sm muted">
            <li>• MP3 audio: maximum 100 MB.</li>
            <li>• MP4 video: maximum 500 MB.</li>
            <li>• PDF documents: maximum 50 MB.</li>
            <li>• Text-based PDFs work best; scanned PDFs are not supported yet (no OCR).</li>
            <li>• Long recordings can take several minutes to process. You can leave the page while it runs.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Lock className="h-5 w-5 text-emerald-600"/>Your material is private</h2>
          <p className="mt-3 text-sm leading-6 muted">Your uploaded file is deleted from our server as soon as its text has been extracted. Generated notes and quizzes are visible only to you.</p>
        </Card>
      </aside>
    </div>
  </>
}

function Option({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){
  return <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium ${checked?'border-primary bg-primary-soft text-primary dark:bg-purple-950':'border-slate-200 dark:border-slate-700'}`}>
    <input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)} className="h-4 w-4"/>{label}
  </label>
}
