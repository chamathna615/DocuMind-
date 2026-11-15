import { useEffect, useRef } from 'react'

interface GoogleCredentialResponse { credential?:string }
interface GoogleButtonProps { onCredential:(credential:string)=>void; onError:(message:string)=>void }

declare global {
  interface Window { google?: { accounts:{ id:{ initialize:(options:{client_id:string;callback:(response:GoogleCredentialResponse)=>void})=>void; renderButton:(element:HTMLElement,options:Record<string,string>)=>void } } } }
}

// Google's script is added to the page once and shared by every button (a second copy breaks the first).
let scriptPromise:Promise<void>|null=null
function loadGoogleScript():Promise<void>{
  if(window.google)return Promise.resolve()
  if(!scriptPromise){
    scriptPromise=new Promise<void>((resolve,reject)=>{
      const script=document.createElement('script')
      script.src='https://accounts.google.com/gsi/client'
      script.async=true
      script.defer=true
      script.onload=()=>resolve()
      script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('Google script failed to load'))}
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export function GoogleSignInButton({onCredential,onError}:GoogleButtonProps){
  const container=useRef<HTMLDivElement>(null)
  const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  // The parent creates new callback functions on every render (for example while typing in the form).
  // Keeping them in refs means the Google button is set up only once and is not redrawn or reset.
  const credentialRef=useRef(onCredential)
  const errorRef=useRef(onError)
  useEffect(()=>{credentialRef.current=onCredential;errorRef.current=onError})

  useEffect(()=>{
    if(!clientId)return
    let cancelled=false
    loadGoogleScript()
      .then(()=>{
        const element=container.current
        if(cancelled||!element||!window.google)return
        window.google.accounts.id.initialize({
          client_id:clientId,
          callback:response=>{
            if(response.credential)credentialRef.current(response.credential)
            else errorRef.current('Google did not return a sign-in credential. Please try again.')
          },
        })
        element.replaceChildren()
        window.google.accounts.id.renderButton(element,{theme:'outline',size:'large',width:String(Math.min(400,element.clientWidth||320)),text:'continue_with',shape:'rectangular'})
      })
      .catch(()=>{if(!cancelled)errorRef.current('Unable to load Google sign-in. Check your network connection.')})
    return()=>{cancelled=true}
  },[clientId])

  if(!clientId)return <button type="button" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" onClick={()=>onError('Google sign-in is not configured for this environment.')}>Continue with Google</button>
  return <div ref={container} className="flex min-h-11 justify-center" aria-label="Continue with Google"/>
}
