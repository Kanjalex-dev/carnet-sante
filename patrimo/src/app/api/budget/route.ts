import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setBudget, rolloverBudgets, suggestBudgets } from '@/server/budget/tracking';
import {
  allocate,
  moveBetweenEnvelopes,
  switchMode,
} from '@/server/budget/envelopes';
import { guard } from '@/server/apiGuard';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('setBudget'),
    categoryId: z.string(),
    month: z.string(),
    amountCents: z.number().int().min(0),
  }),
  z.object({
    action: z.literal('allocate'),
    envelopeId: z.string(),
    month: z.string(),
    amountCents: z.number().int(),
  }),
  z.object({
    action: z.literal('move'),
    fromEnvelopeId: z.string().nullable(),
    toEnvelopeId: z.string().nullable(),
    month: z.string(),
    amountCents: z.number().int().positive(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal('switchMode'),
    mode: z.enum(['TRACKING', 'ENVELOPE']),
    month: z.string(),
  }),
  z.object({ action: z.literal('rollover'), month: z.string() }),
  z.object({ action: z.literal('suggest'), month: z.string() }),
  z.object({
    action: z.literal('applySuggestions'),
    month: z.string(),
    items: z.array(z.object({ categoryId: z.string(), amountCents: z.number().int() })),
  }),
]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Requete invalide.', detail: parsed.error?.issues },
      { status: 400 },
    );
  }

  const auth = await guard();
  if (!auth.ok) return auth.response;
  const { profile } = auth;
  const startDay = profile.monthStartDay;
  const input = parsed.data;

  try {
    switch (input.action) {
      case 'setBudget':
        await setBudget(profile.id, input.categoryId, input.month, input.amountCents);
        return NextResponse.json({ ok: true });

      case 'allocate':
        await allocate(profile.id, input.envelopeId, input.month, input.amountCents);
        return NextResponse.json({ ok: true });

      case 'move':
        await moveBetweenEnvelopes(
          profile.id,
          input.fromEnvelopeId,
          input.toEnvelopeId,
          input.month,
          input.amountCents,
          input.note,
        );
        return NextResponse.json({ ok: true });

      case 'switchMode': {
        const result = await switchMode(profile.id, input.mode, input.month);
        return NextResponse.json(result);
      }

      case 'rollover': {
        const count = await rolloverBudgets(profile.id, input.month);
        return NextResponse.json({ ok: true, count });
      }

      case 'suggest': {
        const suggestions = await suggestBudgets(profile.id, input.month, 6, startDay);
        return NextResponse.json({ suggestions });
      }

      case 'applySuggestions': {
        for (const item of input.items) {
          await setBudget(profile.id, item.categoryId, input.month, item.amountCents);
        }
        return NextResponse.json({ ok: true, count: input.items.length });
      }
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Echec.' },
      { status: 400 },
    );
  }
}
