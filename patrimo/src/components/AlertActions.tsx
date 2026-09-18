'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AlertActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function post(action: string) {
    setBusy(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 text-sm">
      <button
        type="button"
        className="btn-quiet"
        disabled={busy}
        onClick={() => post('rerunAnalysis')}
      >
        Reanalyser
      </button>
      <button
        type="button"
        className="btn-quiet"
        disabled={busy}
        onClick={() => post('markAlertsRead')}
      >
        Tout lire
      </button>
    </div>
  );
}
