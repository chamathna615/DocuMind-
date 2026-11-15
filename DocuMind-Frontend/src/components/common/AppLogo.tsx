import { Link } from 'react-router-dom'

export function AppLogo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 font-bold ${inverse ? 'text-white' : 'text-navy dark:text-white'}`}
      aria-label="LectureLens home"
    >
      <img
        src="/1000289189.png"
        alt="LectureLens logo"
        className={compact ? 'h-9 w-9 rounded-xl object-cover' : 'h-10 w-10 rounded-xl object-cover'}
      />
      {!compact && (
        <span>
          Docu<span className="text-primary">Mind</span>
        </span>
      )}
    </Link>
  )
}

