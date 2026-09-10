export type Tab = 'status' | 'photos' | 'settings'

const ICONS: Record<Tab, { path: React.ReactNode; label: string }> = {
  status: {
    label: 'Statut',
    path: <path d="M12 3 4.5 6.3v5.1c0 4.4 3.1 8.5 7.5 9.6 4.4-1.1 7.5-5.2 7.5-9.6V6.3L12 3Z" />,
  },
  photos: {
    label: 'Carnet',
    path: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 16 4.5-4.5 3 3L16 10l4 4" /><circle cx="9" cy="9" r="1.4" /></>,
  },
  settings: {
    label: 'Réglages',
    path: <><circle cx="12" cy="12" r="3" /><path d="M20 12h1" /><path d="M3 12h1" /><path d="M12 20v1" /><path d="M12 3v1" /><path d="m18 18 .7.7" /><path d="m5.3 5.3.7.7" /><path d="m18 6 .7-.7" /><path d="m5.3 18.7.7-.7" /></>,
  },
}

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bg-surface border-line sticky bottom-0 mx-auto flex w-full max-w-[440px] border-t px-3 pt-2 pb-3.5"
      aria-label="Navigation principale">
      {(Object.keys(ICONS) as Tab[]).map((t) => {
        const active = t === tab
        return (
          <button key={t} onClick={() => onChange(t)} aria-current={active ? 'page' : undefined}
            className="flex min-h-11 flex-1 flex-col items-center gap-1 pt-1">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
              stroke={active ? '#2E5C8A' : '#8C8394'} strokeWidth={active ? 2 : 1.9}
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t].path}
            </svg>
            <span className={`text-[10.5px] ${active ? 'text-blue-500 font-semibold' : 'text-ink-faint font-medium'}`}>
              {ICONS[t].label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
