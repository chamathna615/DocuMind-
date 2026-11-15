import type { Lecture, QuizQuestion } from '@/types'

export const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')
export const formatBytes = (bytes:number) => `${(bytes/1024/1024).toFixed(1)} MB`
export const validateLectureFile = (file:File): string | null => {
  const extension=file.name.split('.').pop()?.toLowerCase()
  if(!['mp3','mp4','m4a','wav','webm','pdf'].includes(extension??'')) return 'Only MP3, M4A, WAV, WEBM, MP4, and PDF files are supported.'
  if(file.size===0) return 'The selected file is empty.'
  const limits={mp3:100,mp4:500,m4a:100,wav:100,webm:100,pdf:50} as const
  const limitMb=limits[extension as keyof typeof limits]
  if(file.size>limitMb*1024*1024) return `${extension?.toUpperCase()} files must be ${limitMb} MB or smaller.`
  return null
}
export const calculateScore=(questions:QuizQuestion[],answers:Record<string,string>)=>questions.reduce((score,q)=>{
  const given=(answers[q.id]??'').trim().toLowerCase()
  if(q.type==='mcq') return score+(given===q.answer.toLowerCase()?1:0)
  return score+(q.keywords?.some(k=>given.includes(k.toLowerCase()))?1:0)
},0)
export function filterLectures(rows:Lecture[],search:string,status:string,sort:string){return rows.filter(l=>(status==='all'||l.status===status)&&`${l.title} ${l.filename}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='oldest'?a.uploadedAt.localeCompare(b.uploadedAt):b.uploadedAt.localeCompare(a.uploadedAt))}
