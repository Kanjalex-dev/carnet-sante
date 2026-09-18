'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ProfileChoice {
  id: string;
  name: string;
  color: string;
  isOwner: boolean;
  locked: boolean;
}

/** Pastille avec l'initiale du profil : reconnaissable sans lire. */
export function ProfileAvatar({
  name,
  color,
  size = 44,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Ecran d'ouverture : on choisit son profil, puis on saisit son code.
 *
 * Deux etapes plutot qu'un seul formulaire : sur un telephone, appuyer sur sa
 * pastille est plus rapide que derouler une liste, et cela evite d'avoir a
 * expliquer ce qu'est un profil. Avec un seul profil, l'etape disparait.
 */
export function ProfileGate({
  profiles,
  nextPath,
}: {
  profiles: ProfileChoice[];
  nextPath: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProfileChoice | null>(
    profiles.length === 1 ? profiles[0] : null,
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError(null);

    if (!/^\d{4,12}$/.test(pin)) {
      setError('Le code doit contenir entre 4 et 12 chiffres.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selected.id, pin }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Echec de la connexion.');
        setPin('');
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  if (!selected) {
    return (
      <div className="space-y-2">
        <p className="pb-2 text-center text-sm text-muted">Qui es-tu ?</p>
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => setSelected(profile)}
            className="card flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-70"
          >
            <ProfileAvatar name={profile.name} color={profile.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{profile.name}</span>
              {profile.locked && (
                <span className="block text-xs text-negative">
                  Verrouille apres trop de tentatives
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col items-center gap-2 pb-2">
        <ProfileAvatar name={selected.name} color={selected.color} size={56} />
        <span className="font-medium">{selected.name}</span>
      </div>
      <input
        className="input text-center text-2xl tracking-[0.5em]"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        maxLength={12}
        autoFocus
        aria-label="Code"
      />
      {error && (
        <p className="text-center text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? '…' : 'Ouvrir'}
      </button>
      {profiles.length > 1 && (
        <button
          type="button"
          className="w-full py-2 text-center text-sm text-muted"
          onClick={() => {
            setSelected(null);
            setPin('');
            setError(null);
          }}
        >
          Changer de profil
        </button>
      )}
    </form>
  );
}

/** Premiere ouverture : on cree le profil proprietaire. */
export function FirstProfileForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError('Indique un prenom pour ce profil.');
      return;
    }
    if (!/^\d{4,12}$/.test(pin)) {
      setError('Le code doit contenir entre 4 et 12 chiffres.');
      return;
    }
    if (pin !== confirmation) {
      setError('Les deux codes ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Echec.');
        return;
      }
      router.replace('/bienvenue');
      router.refresh();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input"
        type="text"
        placeholder="Ton prenom"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={24}
        autoFocus
        aria-label="Prenom"
      />
      <input
        className="input text-center text-2xl tracking-[0.5em]"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        placeholder="••••"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        maxLength={12}
        aria-label="Code"
      />
      <input
        className="input text-center text-2xl tracking-[0.5em]"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        placeholder="••••"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ''))}
        maxLength={12}
        aria-label="Confirmation du code"
      />
      {error && (
        <p className="text-center text-sm text-negative" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? '…' : 'Commencer'}
      </button>
    </form>
  );
}
