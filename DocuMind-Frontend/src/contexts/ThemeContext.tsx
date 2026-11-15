import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CONSENT_CHANGED, preferencesAllowed } from '@/utils/cookieConsent'
type Theme='light'|'dark'
const ThemeContext=createContext<{theme:Theme;toggle:()=>void}>({theme:'light',toggle:()=>undefined})
export function ThemeProvider({children}:{children:ReactNode}){const [theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('lecturelens_theme') as Theme)||'light');useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');const store=()=>{try{if(preferencesAllowed())localStorage.setItem('lecturelens_theme',theme);else localStorage.removeItem('lecturelens_theme')}catch{/* storage unavailable */}};store();window.addEventListener(CONSENT_CHANGED,store);return()=>window.removeEventListener(CONSENT_CHANGED,store)},[theme]);return <ThemeContext.Provider value={{theme,toggle:()=>setTheme(t=>t==='light'?'dark':'light')}}>{children}</ThemeContext.Provider>}
export const useTheme=()=>useContext(ThemeContext)

