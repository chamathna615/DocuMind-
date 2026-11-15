import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
export function ThemeToggle(){const {theme,toggle}=useTheme();return <button onClick={toggle} className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label={`Switch to ${theme==='light'?'dark':'light'} mode`}>{theme==='light'?<Moon className="h-5 w-5"/>:<Sun className="h-5 w-5"/>}</button>}

