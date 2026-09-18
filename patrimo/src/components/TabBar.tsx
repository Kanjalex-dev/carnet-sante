'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const TABS = [
  { href: '/', label: 'Accueil', icon: '◎' },
  { href: '/budget', label: 'Budget', icon: '◧' },
  { href: '/transactions', label: 'Operations', icon: '≡' },
  { href: '/patrimoine', label: 'Patrimoine', icon: '◈' },
  { href: '/reglages', label: 'Reglages', icon: '⚙' },
];

export function TabBar({ alertCount = 0 }: { alertCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-screen-sm">
        {TABS.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={clsx(
                  // 44 px de hauteur minimale : la cible tactile recommandee par
                  // Apple, sous laquelle les erreurs de frappe explosent.
                  'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-[11px]',
                  active ? 'text-accent' : 'text-muted',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span className="relative text-lg leading-none">
                  {tab.icon}
                  {tab.href === '/' && alertCount > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[9px] font-semibold text-white">
                      {alertCount > 9 ? '9+' : alertCount}
                    </span>
                  )}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
