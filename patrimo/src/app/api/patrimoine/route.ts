import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { syncAccount, syncAll } from '@/server/patrimoine/sync';
import { recordValuation } from '@/server/patrimoine/manualEntry';
import { snapshotConsolidated } from '@/server/patrimoine/portfolio';
import { guard } from '@/server/apiGuard';

export const maxDuration = 180;

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('syncAll') }),
  z.object({ action: z.literal('syncAccount'), assetAccountId: z.string() }),
  z.object({
    action: z.literal('createAccount'),
    provider: z.enum(['TRADE_REPUBLIC', 'YOMONI', 'MANUAL']),
    label: z.string().min(1).max(80),
  }),
  // Saisie manuelle : disponible sur toutes les sources, connecteur ou pas.
  z.object({
    action: z.literal('recordValuation'),
    assetAccountId: z.string(),
    asOf: z.string(),
    totalValue: z.number().nonnegative(),
    invested: z.number().nonnegative().optional(),
    breakdown: z.record(z.string(), z.number()),
    note: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal('setProfile'),
    riskProfile: z.number().int().min(1).max(10),
    horizonYears: z.number().int().min(1).max(50),
  }),
]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requete invalide.' }, { status: 400 });
  }
  const auth = await guard();
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const input = parsed.data;

  try {
    switch (input.action) {
      case 'syncAll': {
        const outcomes = await syncAll(profile.id);
        return NextResponse.json({ outcomes });
      }

      case 'syncAccount': {
        const outcome = await syncAccount(profile.id, input.assetAccountId);
        await snapshotConsolidated(profile.id);
        return NextResponse.json({ outcome });
      }

      case 'createAccount': {
        const account = await db.assetAccount.create({
          data: { profileId: profile.id, provider: input.provider, label: input.label },
        });
        return NextResponse.json({ id: account.id });
      }

      case 'recordValuation': {
        const result = await recordValuation(profile.id, input.assetAccountId, {
          asOf: new Date(input.asOf),
          totalValue: input.totalValue,
          invested: input.invested,
          breakdown: input.breakdown as never,
          note: input.note,
        });
        await snapshotConsolidated(profile.id);
        return NextResponse.json(result);
      }

      case 'setProfile': {
        await db.profile.update({
          where: { id: profile.id },
          data: {
            riskProfile: input.riskProfile,
            horizonYears: input.horizonYears,
          },
        });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}
