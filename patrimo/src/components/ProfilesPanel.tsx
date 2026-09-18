'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileAvatar, type ProfileChoice } from './ProfileGate';
import { Section } from './ui';

/**
 * Gestion des profils depuis les reglages.
 *
 * Les actions destructrices ou sensibles demandent le code du proprietaire au
 * moment de l'acte. La session pouvant rester ouverte un mois, une confirmation
 * simple ne prouverait rien sur un telephone deverrouille.
 */
export function ProfilesPanel({
  me,
  profiles,
}: {
  me: { id: string; name: string; color: string; isOwner: boolean };
  profiles: ProfileChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'none' | 'create' | 'switch'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [ownerPin, setOwnerPin] = useState('');

  const [switchTo, setSwitchTo] = useState<ProfileChoice | null>(null);
  const [switchPin, setSwitchPin] = useState('');

  const others = profiles.filter((p) => p.id !== me.id);

  async function call(body: unknown, onDone: () => void) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Echec.');
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Profils">
      <div className="card space-y-3">
        <div className="flex items-center gap-3">
          <ProfileAvatar name={me.name} color={me.color} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{me.name}</div>
            <div className="text-xs text-muted">
              {me.isOwner ? "Proprietaire de l'installation" : 'Profil invite'}
            </div>
          </div>
        </div>

        {others.length > 0 && (
          <ul className="space-y-1 border-t border-line pt-3">
            {others.map((profile) => (
              <li key={profile.id} className="flex items-center gap-3">
                <ProfileAvatar name={profile.name} color={profile.color} size={32} />
                <span className="min-w-0 flex-1 truncate text-sm">{profile.name}</span>
                {me.isOwner && (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-negative"
                    disabled={busy}
                    onClick={() => {
                      const pin = window.prompt(
                        `Supprimer le profil « ${profile.name} » et TOUTES ses donnees.\n\nSaisis ton code pour confirmer :`,
                      );
                      if (!pin) return;
                      void call(
                        { action: 'delete', id: profile.id, ownerPin: pin },
                        () => setMessage(`Profil « ${profile.name} » supprime.`),
                      );
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {others.length > 0 && (
            <button
              type="button"
              className="btn-quiet text-sm"
              onClick={() => setOpen(open === 'switch' ? 'none' : 'switch')}
            >
              Changer de profil
            </button>
          )}
          {me.isOwner && (
            <button
              type="button"
              className="btn-quiet text-sm"
              onClick={() => setOpen(open === 'create' ? 'none' : 'create')}
            >
              Ajouter un profil
            </button>
          )}
        </div>

        {open === 'create' && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs text-muted">
              Le nouveau profil demarre vide, avec ses propres comptes et son
              propre code. Il ne verra jamais tes operations, et tu ne verras
              jamais les siennes.
            </p>
            <input
              className="input"
              placeholder="Prenom"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={24}
            />
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="Son code (4 a 12 chiffres)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              maxLength={12}
            />
            <input
              className="input"
              type="password"
              inputMode="numeric"
              placeholder="Ton code, pour confirmer"
              value={ownerPin}
              onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
              maxLength={12}
            />
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy}
              onClick={() =>
                void call(
                  {
                    action: 'create',
                    name: newName.trim(),
                    pin: newPin,
                    ownerPin,
                  },
                  () => {
                    setMessage(`Profil « ${newName.trim()} » cree.`);
                    setNewName('');
                    setNewPin('');
                    setOwnerPin('');
                    setOpen('none');
                  },
                )
              }
            >
              {busy ? '…' : 'Creer le profil'}
            </button>
          </div>
        )}

        {open === 'switch' && (
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {others.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`chip ${switchTo?.id === profile.id ? 'border-accent text-accent' : ''}`}
                  onClick={() => setSwitchTo(profile)}
                >
                  {profile.name}
                </button>
              ))}
            </div>
            {switchTo && (
              <>
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  placeholder={`Code de ${switchTo.name}`}
                  value={switchPin}
                  onChange={(e) => setSwitchPin(e.target.value.replace(/\D/g, ''))}
                  maxLength={12}
                />
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={busy}
                  onClick={() =>
                    void call(
                      { action: 'switch', id: switchTo.id, pin: switchPin },
                      () => {
                        setSwitchPin('');
                        setOpen('none');
                        router.replace('/');
                      },
                    )
                  }
                >
                  {busy ? '…' : `Ouvrir le profil de ${switchTo.name}`}
                </button>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-negative" role="alert">
            {error}
          </p>
        )}
        {message && <p className="text-sm text-positive">{message}</p>}
      </div>
    </Section>
  );
}
