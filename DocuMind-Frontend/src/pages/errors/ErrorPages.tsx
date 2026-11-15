import { Link } from 'react-router-dom'
import { ShieldX, Telescope } from 'lucide-react'
import { AppLogo } from '@/components/common/AppLogo'
import { Button } from '@/components/ui'
export function UnauthorizedPage(){return <ErrorPage code="403" title="This area isn’t available to you" text="Your account does not have permission to open this page." icon={<ShieldX/>}/>}
export function NotFoundPage(){return <ErrorPage code="404" title="We couldn’t find that page" text="The page may have moved, or the address might be incorrect." icon={<Telescope/>}/>}
function ErrorPage({code,title,text,icon}:{code:string;title:string;text:string;icon:React.ReactNode}){return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center dark:bg-slate-950"><div><AppLogo/><div className="mx-auto mt-10 grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary dark:bg-purple-950">{icon}</div><p className="mt-6 text-sm font-bold tracking-[.2em] text-primary">ERROR {code}</p><h1 className="mt-3 text-3xl font-bold">{title}</h1><p className="mx-auto mt-3 max-w-md muted">{text}</p><Link to="/" className="mt-7 inline-block"><Button>Back to home</Button></Link></div></main>}

