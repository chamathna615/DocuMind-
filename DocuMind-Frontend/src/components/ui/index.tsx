import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '@/utils/helpers'

export function Button({className,variant='primary',loading,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger';loading?:boolean}){
  const styles={primary:'bg-primary text-white hover:bg-[#6245b7] shadow-sm',secondary:'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white',ghost:'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',danger:'bg-red-600 text-white hover:bg-red-700'}
  return <button className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50',styles[variant],className)} {...props} disabled={loading||props.disabled}>{loading&&<LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true"/>}{children}</button>
}
export function Card({className,...props}:HTMLAttributes<HTMLDivElement>){return <div className={cn('surface',className)} {...props}/>} 
export function Input({className,...props}:InputHTMLAttributes<HTMLInputElement>){return <input className={cn('field',className)} {...props}/>} 
export function Progress({value,label}:{value:number;label?:string}){return <div><div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{width:`${Math.min(100,Math.max(0,value))}%`}}/></div></div>}
export function Skeleton({className}:{className?:string}){return <div className={cn('animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800',className)}/>} 
export function ErrorText({children}:{children?:ReactNode}){return children?<p role="alert" className="mt-1 text-sm text-red-600">{children}</p>:null}
export function Switch({checked,onChange,label,disabled}:{checked:boolean;onChange:(value:boolean)=>void;label:string;disabled?:boolean}){return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={()=>onChange(!checked)} className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',checked?'bg-primary':'bg-slate-300 dark:bg-slate-600')}><span aria-hidden="true" className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',checked?'translate-x-5':'translate-x-0.5')}/></button>}

