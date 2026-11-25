import { ArrowLeft, LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useNavigate } from 'react-router'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary:
    'border border-stone-300 bg-white text-stone-900 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800',
  ghost: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button
      type="button"
      disabled={busy || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
      <LoaderCircle className="size-5 animate-spin text-brand-500" />
      {label}
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
      {icon && (
        <div className="rounded-full bg-brand-50 p-4 text-brand-600 dark:bg-brand-600/15 dark:text-brand-400">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="max-w-sm text-sm text-stone-500">{children}</div>}
    </div>
  )
}

/** Sticky page title with an optional back button. */
export function PageHeader({
  title,
  subtitle,
  back = false,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: boolean
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-stone-200 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/85">
      {back && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-2 rounded-full p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-stone-500">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex border-b border-stone-200 dark:border-stone-800" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className="relative flex-1 py-3 text-sm font-semibold text-stone-500 hover:bg-stone-50 aria-selected:text-stone-900 dark:hover:bg-stone-900 dark:aria-selected:text-white"
        >
          {tab.label}
          {value === tab.id && <span className="absolute inset-x-1/4 bottom-0 h-1 rounded-full bg-brand-500" />}
        </button>
      ))}
    </div>
  )
}

export function PostSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
      <div className="size-11 shrink-0 rounded-full bg-stone-200 dark:bg-stone-800" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-1/3 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-3 w-full rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-3 w-2/3 rounded bg-stone-200 dark:bg-stone-800" />
      </div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-800 dark:bg-stone-900/60 ${className}`}
    >
      {children}
    </section>
  )
}

export const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-[15px] outline-none transition placeholder:text-stone-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-stone-700 dark:bg-stone-900'
