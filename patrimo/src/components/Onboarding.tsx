'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImportForm } from './ImportForm';
import { Notice } from './ui';

type Step = 'choix' | 'import' | 'manuel';

/**
 * Parcours de demarrage.
 *
 * Deux facons d'avoir des chiffres a l'ecran, presentees cote a cote parce
 * qu'aucune n'est meilleure : l'import d'un releve donne l'historique et les
 * abonnements, la saisie du solde donne un point de depart en dix secondes.
 * Le lien « je regarderai plus tard » est volontairement present : forcer
 * quelqu'un a importer un fichier bancaire avant d'avoir vu l'application est
 * le meilleur moyen qu'il ne revienne pas.
 */
export function Onboarding({
  name,
  accounts,
  alreadyHasData,
}: {
  name: string;
  accounts: { id: string; name: string }[];
  alreadyHasData: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(alreadyHasData ? 'manuel' : 'choix');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState('Compte courant');
  const [balance, setBalance] = useState('');

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'done' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? 'Echec.');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  async function saveBalance() {
    const parsed = Number(balance.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setError('Saisis un montant, par exemple 1250,40.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'openingBalance',
          accountName: accountName.trim() || 'Compte courant',
          amountEur: parsed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? 'Echec.');
        return;
      }
      await finish();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="pt-6">
        <h1 className="text-2xl font-semibold">Bonjour {name}</h1>
        <p className="mt-1 text-sm text-muted">
          Une chose a faire pour que l&apos;application serve a quelque chose :
          lui donner des chiffres.
        </p>
      </header>

      {step === 'choix' && (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            className="card w-full text-left active:opacity-70"
            onClick={() => setStep('import')}
          >
            <div className="font-medium">Importer un releve bancaire</div>
            <p className="mt-1 text-sm text-muted">
              Le fichier CSV ou OFX telecharge depuis ta banque. C&apos;est le
              chemin complet : historique, categories, abonnements detectes,
              previsionnel. Compte deux minutes.
            </p>
          </button>

          <button
            type="button"
            className="card w-full text-left active:opacity-70"
            onClick={() => setStep('manuel')}
          >
            <div className="font-medium">Partir de mon solde actuel</div>
            <p className="mt-1 text-sm text-muted">
              Un montant, et c&apos;est parti. Tu pourras importer un releve
              quand tu veux — rien n&apos;est perdu, les deux se completent.
            </p>
          </button>

          <button
            type="button"
            className="w-full py-3 text-center text-sm text-muted"
            onClick={() => void finish()}
            disabled={busy}
          >
            Je regarderai plus tard
          </button>
        </div>
      )}

      {step === 'import' && (
        <div className="mt-6 space-y-3">
          <Notice title="Ou trouver ce fichier">
            Depuis le site ou l&apos;application de ta banque, cherche
            « Exporter » ou « Telecharger les operations ». Sur iPhone, choisis
            « Enregistrer dans Fichiers » ; le selecteur ci-dessous y accede.
          </Notice>
          <ImportForm accounts={accounts} />
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void finish()}
            disabled={busy}
          >
            {busy ? '…' : "Terminer et voir l'application"}
          </button>
          <button
            type="button"
            className="w-full py-2 text-center text-sm text-muted"
            onClick={() => setStep('choix')}
          >
            Retour
          </button>
        </div>
      )}

      {step === 'manuel' && (
        <div className="mt-6 space-y-3">
          <div className="card space-y-3">
            <label className="block">
              <span className="label">Nom du compte</span>
              <input
                className="input mt-1"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                maxLength={60}
              />
            </label>
            <label className="block">
              <span className="label">Solde actuel (€)</span>
              <input
                className="input mt-1"
                inputMode="decimal"
                placeholder="1250,40"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">
              Ce solde sert d&apos;ancrage au previsionnel. Il est enregistre
              comme une operation d&apos;ouverture, que tu pourras corriger ou
              supprimer plus tard.
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => void saveBalance()}
              disabled={busy || balance.trim() === ''}
            >
              {busy ? '…' : 'Enregistrer et continuer'}
            </button>
          </div>
          <button
            type="button"
            className="w-full py-2 text-center text-sm text-muted"
            onClick={() => setStep('choix')}
          >
            Retour
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-center text-sm text-negative" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
