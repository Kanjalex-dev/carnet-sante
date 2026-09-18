import { NextResponse } from 'next/server';
import { z } from 'zod';
import { attemptPin, createSession, setSessionCookie } from '@/server/auth';

const schema = z.object({
  profileId: z.string().min(1),
  pin: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });
  }

  const result = await attemptPin(parsed.data.profileId, parsed.data.pin);

  if (result.ok) {
    await setSessionCookie(await createSession(result.profileId));
    return NextResponse.json({ ok: true });
  }

  if (result.reason === 'not_configured') {
    return NextResponse.json({ error: 'Profil introuvable.' }, { status: 409 });
  }
  if (result.reason === 'locked') {
    const minutes = Math.ceil((result.until.getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `Trop de tentatives. Reessaie dans ${minutes} minute(s).` },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: `Code incorrect. ${result.remaining} tentative(s) restante(s).` },
    { status: 401 },
  );
}
