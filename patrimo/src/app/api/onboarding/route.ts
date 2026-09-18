import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { guard } from '@/server/apiGuard';
import { markOnboarded } from '@/server/auth';
import { dateOnly } from '@/lib/dates';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('done') }),
  z.object({
    action: z.literal('openingBalance'),
    accountName: z.string().min(1).max(60),
    amountEur: z.number().finite(),
  }),
]);

export async function POST(request: Request) {
  const auth = await guard();
  if (!auth.ok) return auth.response;
  const { profile } = auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requete invalide.' }, { status: 400 });
  }
  const input = parsed.data;

  try {
    if (input.action === 'done') {
      await markOnboarded(profile.id);
      return NextResponse.json({ ok: true });
    }

    // Solde d'ouverture.
    //
    // On l'enregistre comme une vraie operation plutot que comme un champ a
    // part : tout le reste de l'application — previsionnel, enveloppes, age de
    // l'argent — raisonne sur les operations. Un solde stocke ailleurs serait
    // un second chemin a maintenir, et le premier a diverger.
    const account =
      (await db.account.findFirst({
        where: { profileId: profile.id, name: input.accountName },
      })) ??
      (await db.account.create({
        data: { profileId: profile.id, name: input.accountName, kind: 'CHECKING' },
      }));

    const date = dateOnly(new Date());
    const rawLabel = 'Solde d’ouverture';
    // Empreinte deterministe : reprendre le parcours ne cree pas un doublon,
    // il met a jour la meme ligne.
    const fingerprint = createHash('sha256')
      .update(`${account.id}|opening-balance`)
      .digest('hex');

    const opening = await db.transaction.findUnique({ where: { fingerprint } });
    const amount = new Prisma.Decimal(input.amountEur.toFixed(2));

    if (opening) {
      await db.transaction.update({
        where: { id: opening.id },
        data: { amount, date },
      });
    } else {
      await db.transaction.create({
        data: {
          profileId: profile.id,
          accountId: account.id,
          date,
          amount,
          rawLabel,
          label: rawLabel,
          // Un solde d'ouverture n'est ni un revenu ni une depense : le marquer
          // comme virement l'exclut des statistiques, ou il n'aurait aucun sens.
          isTransfer: true,
          categorySource: 'MANUAL',
          fingerprint,
        },
      });
    }

    await db.account.update({
      where: { id: account.id },
      data: { statedBalance: amount, statedBalanceDate: date },
    });

    return NextResponse.json({ ok: true, accountId: account.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}
