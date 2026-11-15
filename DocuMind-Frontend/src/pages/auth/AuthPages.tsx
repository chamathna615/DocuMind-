import { useEffect, useRef, useState } from 'react'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Eye, EyeOff, Loader2, LockKeyhole, Mail, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { AppLogo } from '@/components/common/AppLogo'
import { Button, Card, ErrorText, Input } from '@/components/ui'
import { forgotPasswordSchema, loginSchema, registrationSchema, resetPasswordSchema } from '@/schemas/auth'
import { registerUser, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from '@/api/authApi'
import { ApiError } from '@/api/http'
import { useAuth } from '@/contexts/AuthContext'
import { GoogleSignInButton } from '@/components/common/GoogleSignInButton'
import type { z } from 'zod'

// One-time tokens are always 64 hex characters (checked here so an obviously broken link never hits the server).
const TOKEN_FORMAT = /^[a-f0-9]{64}$/

function AuthShell({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <main className="min-h-screen bg-slate-50 dark:bg-slate-950"><a href="#auth-form" className="skip-link">Skip to form</a><div className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]"><aside className="hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between"><AppLogo inverse/><div><span className="inline-flex rounded-full bg-white/10 px-3 py-1.5 text-sm">AI-powered learning workspace</span><h2 className="mt-6 max-w-md text-4xl font-bold leading-tight">Spend less time replaying. Spend more time understanding.</h2><p className="mt-4 max-w-md text-blue-100">One calm workspace for every lecture, note, study guide and quiz.</p></div><p className="text-sm text-blue-200">Open University student project · Frontend demonstration</p></aside><section id="auth-form" className="flex items-center justify-center px-4 py-10 sm:px-8"><div className="w-full max-w-md"><div className="mb-8 lg:hidden"><AppLogo/></div><h1 className="text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 muted">{subtitle}</p><Card className="mt-7 p-6 sm:p-8">{children}</Card></div></section></div></main>}
function PasswordField({id,registration,...props}:{id:string;registration:UseFormRegisterReturn;placeholder?:string;autoComplete?:string}){const [visible,setVisible]=useState(false);return <div className="relative"><Input id={id} type={visible?'text':'password'} className="pr-11" {...registration} {...props}/><button type="button" onClick={()=>setVisible(!visible)} className="absolute right-1 top-0 grid h-11 w-10 place-items-center text-slate-500" aria-label={`${visible?'Hide':'Show'} password`}>{visible?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div>}

// Round icon used by the "check your inbox" / success / error states.
function StatusIcon({tone,children}:{tone:'success'|'error';children:React.ReactNode}){return <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${tone==='success'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-600'}`}>{children}</div>}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */
type LoginValues=z.infer<typeof loginSchema>
export function LoginPage(){
  const {signIn,signInWithGoogle}=useAuth()
  const [serverError,setServerError]=useState('')
  const [unverified,setUnverified]=useState(false)
  const [resending,setResending]=useState(false)
  const {register,handleSubmit,getValues,formState:{errors,isSubmitting}}=useForm<LoginValues>({resolver:zodResolver(loginSchema),defaultValues:{email:'',password:'',remember:true}})

  const submit=async(v:LoginValues)=>{
    setServerError('');setUnverified(false)
    try{await signIn(v.email,v.password,v.remember);toast.success('Welcome back')}
    catch(e){
      setUnverified(e instanceof ApiError&&e.code==='EMAIL_NOT_VERIFIED')
      setServerError(e instanceof Error?e.message:'Unable to sign in.')
    }
  }
  const googleSubmit=async(credential:string)=>{
    setServerError('');setUnverified(false)
    try{await signInWithGoogle(credential);toast.success('Welcome back')}
    catch(e){setServerError(e instanceof Error?e.message:'Unable to sign in with Google.')}
  }
  const resend=async()=>{
    setResending(true)
    try{toast.success(await resendVerification(getValues('email').trim()))}
    catch(e){toast.error(e instanceof Error?e.message:'Could not send the email.')}
    finally{setResending(false)}
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to continue to your learning workspace.">
    <GoogleSignInButton onCredential={googleSubmit} onError={setServerError}/>
    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200 dark:bg-slate-700"/>or<span className="h-px flex-1 bg-slate-200 dark:bg-slate-700"/></div>
    <form onSubmit={handleSubmit(submit)} noValidate>
      <div><label className="label" htmlFor="email">Email address</label><Input id="email" type="email" autoComplete="email" {...register('email')}/><ErrorText>{errors.email?.message}</ErrorText></div>
      <div className="mt-4"><div className="flex justify-between"><label className="label" htmlFor="password">Password</label><Link to="/forgot-password" className="text-sm font-medium text-primary">Forgot password?</Link></div><PasswordField id="password" autoComplete="current-password" registration={register('password')}/><ErrorText>{errors.password?.message}</ErrorText></div>
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded text-primary" {...register('remember')}/>Remember me</label>
      {serverError&&<div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>{serverError}</p>{unverified&&<Button type="button" variant="secondary" className="mt-3 w-full" loading={resending} onClick={resend}><Mail className="h-4 w-4"/>Send a new verification email</Button>}</div>}
      <Button type="submit" loading={isSubmitting} className="mt-5 w-full">Sign in</Button>
    </form>
    <p className="mt-6 text-center text-sm muted">New here? <Link className="font-semibold text-primary" to="/register">Create an account</Link></p>
  </AuthShell>
}

/* ------------------------------------------------------------------ */
/* Create account                                                      */
/* ------------------------------------------------------------------ */
type RegisterValues=z.infer<typeof registrationSchema>
export function RegisterPage() {
  const nav = useNavigate()
  const { signInWithGoogle, setUser } = useAuth()
  const [serverError, setServerError] = useState('')
  const [sentTo, setSentTo] = useState('') // set once the account is created and a verification email was sent
  const [resending, setResending] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { terms: false as true },
  })

  const submit = async (values: RegisterValues) => {
    setServerError('')
    try {
      const result = await registerUser(values)
      if (result.user) {
        // The server has email verification switched off, so the new account is already signed in.
        setUser(result.user)
        toast.success('Account created')
        nav('/dashboard', { replace: true })
        return
      }
      setSentTo(values.email.trim())
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Registration failed.')
    }
  }

  const googleSubmit = async (credential: string) => {
    setServerError('')

    try {
      await signInWithGoogle(credential)
      toast.success('Account created with Google')
      nav('/dashboard', { replace: true })
    } catch (e) {
      setServerError(
        e instanceof Error ? e.message : 'Unable to continue with Google.'
      )
    }
  }

  const resend = async () => {
    setResending(true)
    try {
      toast.success(await resendVerification(sentTo))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the email.')
    } finally {
      setResending(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle="One more step before you can sign in.">
        <div className="text-center">
          <StatusIcon tone="success"><Mail /></StatusIcon>
          <h2 className="mt-4 font-semibold">Verification link sent</h2>
          <p className="mt-2 text-sm muted">
            We sent a link to <strong className="break-all">{sentTo}</strong>. Open it to verify your address, then sign in. The link works once and expires in 24 hours. Check your spam folder if you can&apos;t find it.
          </p>
          <Button type="button" variant="secondary" className="mt-6 w-full" loading={resending} onClick={resend}>
            Send the email again
          </Button>
          <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-primary">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start turning recordings into focused learning materials."
    >
      <GoogleSignInButton
        onCredential={googleSubmit}
        onError={setServerError}
      />

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <Input id="name" autoComplete="name" {...register('name')} />
          <ErrorText>{errors.name?.message}</ErrorText>
        </div>

        <div>
          <label className="label" htmlFor="reg-email">Email address</label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            {...register('email')}
          />
          <ErrorText>{errors.email?.message}</ErrorText>
        </div>

        <div>
          <label className="label" htmlFor="reg-password">Password</label>
          <PasswordField
            id="reg-password"
            autoComplete="new-password"
            registration={register('password')}
          />
          <ErrorText>{errors.password?.message}</ErrorText>
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">
            Confirm password
          </label>
          <PasswordField
            id="confirmPassword"
            autoComplete="new-password"
            registration={register('confirmPassword')}
          />
          <ErrorText>{errors.confirmPassword?.message}</ErrorText>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            {...register('terms')}
          />
          I accept the terms and privacy notice.
        </label>
        <ErrorText>{errors.terms?.message}</ErrorText>

        {serverError && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </p>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm muted">
        Already registered?{' '}
        <Link className="font-semibold text-primary" to="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

/* ------------------------------------------------------------------ */
/* Forgot password: asks the server to email a one-time reset link     */
/* ------------------------------------------------------------------ */
type ForgotValues=z.infer<typeof forgotPasswordSchema>
export function ForgotPasswordPage(){
  const [sent,setSent]=useState(false)
  const [serverError,setServerError]=useState('')
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<ForgotValues>({resolver:zodResolver(forgotPasswordSchema),defaultValues:{email:''}})

  const submit=async(v:ForgotValues)=>{
    setServerError('')
    try{await requestPasswordReset(v.email);setSent(true)}
    catch(e){setServerError(e instanceof Error?e.message:'Something went wrong. Please try again.')}
  }

  return <AuthShell title="Reset your password" subtitle="We’ll send instructions if the address matches an account.">
    {sent
      ?<div className="text-center"><StatusIcon tone="success"><LockKeyhole/></StatusIcon><h2 className="mt-4 font-semibold">Check your inbox</h2><p className="mt-2 text-sm muted">If an account exists for that email, password reset instructions are on the way. The link works once and expires soon. Check your spam folder too.</p><Link to="/login" className="mt-6 inline-block font-semibold text-primary">Back to sign in</Link></div>
      :<form onSubmit={handleSubmit(submit)} noValidate>
        <label className="label" htmlFor="forgot-email">Email address</label>
        <Input id="forgot-email" type="email" autoComplete="email" {...register('email')}/>
        <ErrorText>{errors.email?.message}</ErrorText>
        {serverError&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
        <Button className="mt-5 w-full" loading={isSubmitting}>Send reset link</Button>
        <Link to="/login" className="mt-5 block text-center text-sm font-semibold text-primary">Back to sign in</Link>
      </form>}
  </AuthShell>
}

/* ------------------------------------------------------------------ */
/* Reset password: opened from the link in the email (?token=...)      */
/* ------------------------------------------------------------------ */
type ResetValues=z.infer<typeof resetPasswordSchema>
export function ResetPasswordPage(){
  const [params]=useSearchParams()
  const token=params.get('token')??''
  const [done,setDone]=useState(false)
  const [linkProblem,setLinkProblem]=useState(false)
  const [serverError,setServerError]=useState('')
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<ResetValues>({resolver:zodResolver(resetPasswordSchema),defaultValues:{password:'',confirm:''}})

  if(!TOKEN_FORMAT.test(token)||linkProblem)return <AuthShell title="This link is not valid" subtitle="It may have expired or already been used."><div className="text-center"><StatusIcon tone="error"><XCircle/></StatusIcon><p className="mt-4 text-sm muted">Reset links work once and expire after a short time. Request a fresh one to continue.</p><Link to="/forgot-password"><Button className="mt-6 w-full">Request a new link</Button></Link></div></AuthShell>

  if(done)return <AuthShell title="Password updated" subtitle="You can now sign in with your new password."><div className="text-center"><StatusIcon tone="success"><Check/></StatusIcon><p className="mt-4 text-sm muted">For your security you were signed out on all devices.</p><Link to="/login"><Button className="mt-6 w-full">Return to sign in</Button></Link></div></AuthShell>

  const submit=async(v:ResetValues)=>{
    setServerError('')
    try{await resetPassword(token,v.password);setDone(true)}
    catch(e){
      const message=e instanceof Error?e.message:'Could not update the password.'
      // A weak password can simply be corrected (the link is not used up); a dead link needs a new one.
      if(/invalid or has expired/i.test(message))setLinkProblem(true)
      else setServerError(message)
    }
  }

  return <AuthShell title="Choose a new password" subtitle="Use at least eight characters with upper and lower case letters and a number.">
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
      <div><label className="label" htmlFor="new-password">New password</label><PasswordField id="new-password" autoComplete="new-password" registration={register('password')}/><ErrorText>{errors.password?.message}</ErrorText></div>
      <div><label className="label" htmlFor="confirm-new">Confirm password</label><PasswordField id="confirm-new" autoComplete="new-password" registration={register('confirm')}/><ErrorText>{errors.confirm?.message}</ErrorText></div>
      {serverError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{serverError}</p>}
      <Button className="w-full" loading={isSubmitting}>Update password</Button>
    </form>
  </AuthShell>
}

/* ------------------------------------------------------------------ */
/* Verify email: opened from the link in the email (?token=...)        */
/* ------------------------------------------------------------------ */
export function VerifyEmailPage(){
  const [params]=useSearchParams()
  const token=params.get('token')??''
  const [state,setState]=useState<'loading'|'ok'|'error'>('loading')
  const [message,setMessage]=useState('')
  const started=useRef(false) // the link works once, so the request must be sent exactly once

  useEffect(()=>{
    if(started.current)return
    started.current=true
    if(!TOKEN_FORMAT.test(token)){setState('error');setMessage('This verification link is invalid or incomplete.');return}
    verifyEmail(token)
      .then((m)=>{setMessage(m);setState('ok')})
      .catch((e)=>{setMessage(e instanceof Error?e.message:'Verification failed. Please try again.');setState('error')})
  },[token])

  return <AuthShell title={state==='ok'?'Email verified':state==='error'?'Verification failed':'Verifying your email'} subtitle={state==='loading'?'Just a moment…':'DocuMind account'}>
    <div className="text-center" aria-live="polite">
      {state==='loading'&&<><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden="true"/><p className="mt-4 text-sm muted">Checking your link…</p></>}
      {state==='ok'&&<><StatusIcon tone="success"><Check/></StatusIcon><p className="mt-4 text-sm muted">{message}</p><Link to="/login"><Button className="mt-6 w-full">Continue to sign in</Button></Link></>}
      {state==='error'&&<><StatusIcon tone="error"><XCircle/></StatusIcon><p className="mt-4 text-sm muted">{message}</p><Link to="/login"><Button className="mt-6 w-full">Go to sign in</Button></Link><p className="mt-4 text-xs muted">Trying to sign in with an unverified address sends you a fresh link.</p></>}
    </div>
  </AuthShell>
}
