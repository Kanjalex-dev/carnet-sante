import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/server/db';
import { changePin } from '@/server/auth';
import { guard } from '@/server/apiGuard';
import { recategorizeUnset } from '@/server/categorize/engine';
import { detectRecurring } from '@/server/analysis/recurring';
import { evaluateAlerts, markAlertsRead } from '@/server/analysis/alerts';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    monthStartDay: z.number().int().min(1).max(28).optional(),
    aiEnabled: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('changePin'),
    current: z.string(),
    next: z.string(),
  }),
  z.object({
    action: z.literal('createAccount'),
    name: z.string().min(1).max(60),
    kind: z.enum(['CHECKING', 'SAVINGS', 'CARD', 'CASH']),
    institution: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal('setAlertRule'),
    type: z.string(),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.number()).optional(),
  }),
  z.object({ action: z.literal('recategorize') }),
  z.object({ action: z.literal('rerunAnalysis') }),
  z.object({ action: z.literal('markAlertsRead'), ids: z.array(z.string()).optional() }),
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
    switch (input.action) {
      case 'update':
        await db.profile.update({
          where: { id: profile.id },
          data: {
            monthStartDay: input.monthStartDay,
            aiEnabled: input.aiEnabled,
          },
        });
        return NextResponse.json({ ok: true });

      case 'changePin':
        await changePin(profile.id, input.current, input.next);
        return NextResponse.json({ ok: true });

      case 'createAccount': {
        const account = await db.account.create({
          data: {
            profileId: profile.id,
            name: input.name,
            kind: input.kind,
            institution: input.institution,
          },
        });
        return NextResponse.json({ id: account.id });
      }

      case 'setAlertRule': {
        const rule = await db.alertRule.findUnique({
          where: {
            profileId_type: { profileId: profile.id, type: input.type as never },
          },
        });
        if (!rule) {
          return NextResponse.json({ error: 'Alerte inconnue.' }, { status: 404 });
        }
        await db.alertRule.update({
          where: { id: rule.id },
          data: {
            enabled: input.enabled ?? rule.enabled,
            config: input.config ?? (rule.config as never),
          },
        });
        return NextResponse.json({ ok: true });
      }

      case 'recategorize': {
        const updated = await recategorizeUnset(profile.id);
        return NextResponse.json({ updated });
      }

      case 'rerunAnalysis': {
        const recurring = await detectRecurring(profile.id);
        const alerts = await evaluateAlerts(profile.id);
        return NextResponse.json({ recurring, alerts });
      }

      case 'markAlertsRead': {
        const count = await markAlertsRead(profile.id, input.ids);
        return NextResponse.json({ count });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}
