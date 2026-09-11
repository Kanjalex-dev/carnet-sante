import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { computeStatus, upcomingDoses } from '../domain/status'
import type { Child, Schedule, VaccinationEvent } from '../domain/types'
import { type AttachmentMeta, readAttachment } from './repository'
import { today as todayFn } from '../domain/dates'

/**
 * Récapitulatif vaccinal.
 *
 * Ce document n'est PAS un certificat : il ne fait foi qu'une fois contresigné
 * par un professionnel de santé. La mention de pied de page et le cartouche de
 * signature ne sont pas optionnels — c'est ce qui empêche le document de
 * prétendre à une valeur qu'il n'a pas.
 */

const A4: [number, number] = [595.28, 841.89]
const M = 48

const INK = rgb(0.141, 0.122, 0.149)
const INK_STRONG = rgb(0.267, 0.243, 0.286)
const INK_MUTED = rgb(0.420, 0.384, 0.439)
const LINE = rgb(0.914, 0.882, 0.902)
const LINE_SOFT = rgb(0.945, 0.922, 0.933)
const BLUE = rgb(0.180, 0.361, 0.541)
const ROSE = rgb(0.769, 0.420, 0.545)
const OK = rgb(0.184, 0.478, 0.341)
const DUE = rgb(0.588, 0.388, 0.102)
const LATE = rgb(0.737, 0.275, 0.149)
const TINT = rgb(0.992, 0.980, 0.965)
const PAPER = rgb(0.980, 0.969, 0.973)

/** Les polices standard PDF couvrent le latin-1 ; on remplace le reste. */
function wa(s: string): string {
  return s
    .replace(/‑/g, '-').replace(/[‒-―]/g, '-')
    .replace(/’/g, "'").replace(/[“”]/g, '"')
    .replace(/…/g, '...').replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

const FR = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const FR_LONG = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
function d(iso: string, long = false): string {
  const [y, m, day] = iso.split('-').map(Number)
  return (long ? FR_LONG : FR).format(new Date(y, m - 1, day))
}

interface Fonts { regular: PDFFont; bold: PDFFont }

function text(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(wa(s), { x, y, size, font, color })
}

/** Coupe un texte à la largeur donnée et renvoie les lignes. */
function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const words = wa(s).split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = w }
    else line = next
  }
  if (line) lines.push(line)
  return lines
}

export interface RecapOptions {
  includePhotos: boolean
  includeSignature: boolean
  includeLots: boolean
}

export async function buildRecap(
  child: Child,
  schedule: Schedule,
  events: VaccinationEvent[],
  attachments: AttachmentMeta[],
  options: RecapOptions,
): Promise<Uint8Array> {
  const today = todayFn()
  const doc = await PDFDocument.create()
  doc.setTitle(`Recapitulatif vaccinal - ${child.firstName}`)
  doc.setProducer('Carnet')
  doc.setCreationDate(new Date())

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  // Un document lu par un médecin ne doit pas porter nos codes internes.
  const labels = new Map(schedule.valences.map((v) => [v.code, v.shortLabel]))
  const readable = (codes: string[]) =>
    codes.map((c) => labels.get(c) ?? c).join(', ')

  const live = events.filter((e) => !e.deletedAt).sort((a, b) => (a.date < b.date ? -1 : 1))
  const statuses = computeStatus(schedule, child.birthDate, events, today)
  const mandatory = statuses.filter((v) => v.mandatory)
  const satisfied = mandatory.filter((v) => !v.hasLate).length
  const remaining = upcomingDoses(statuses, today).filter((x) => x.state === 'late' || x.state === 'due')

  const photoPages = options.includePhotos ? attachments.length : 0
  const total = 1 + photoPages

  const page = doc.addPage(A4)
  drawRecapPage(page, fonts, {
    child, schedule, live, readable,
    statuses: { total: mandatory.length, satisfied }, remaining, options, today, total,
  })

  if (options.includePhotos) {
    let n = 2
    for (const meta of attachments) {
      const bytes = await readAttachment(meta.id)
      if (!bytes) continue
      await drawPhotoPage(doc, fonts, bytes, meta, n, total, child.firstName)
      n += 1
    }
  }

  return doc.save()
}

function drawRecapPage(page: PDFPage, f: Fonts, ctx: {
  child: Child; schedule: Schedule; live: VaccinationEvent[]
  readable: (codes: string[]) => string
  statuses: { total: number; satisfied: number }
  remaining: { shortLabel: string; doseNumber: number; targetDate: string; state: string }[]
  options: RecapOptions; today: string; total: number
}) {
  const { width, height } = page.getSize()
  const right = width - M
  let y = height

  // Filet bleu -> rose
  const steps = 60
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1)
    page.drawRectangle({
      x: (width / steps) * i, y: height - 6, width: width / steps + 1, height: 6,
      color: rgb(
        BLUE.red + (ROSE.red - BLUE.red) * t,
        BLUE.green + (ROSE.green - BLUE.green) * t,
        BLUE.blue + (ROSE.blue - BLUE.blue) * t,
      ),
    })
  }
  y = height - 6 - 34

  // En-tête
  text(page, 'Récapitulatif vaccinal', M, y - 18, 21, f.bold)
  text(page, `Établi le ${d(ctx.today, true)} à partir du carnet de santé`, M, y - 36, 10, f.regular, INK_STRONG)
  const ref = `Réf. ${ctx.schedule.id}`
  text(page, ref, right - f.regular.widthOfTextAtSize(wa(ref), 9), y - 18, 9, f.regular, INK_MUTED)
  y -= 50
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1.2, color: INK })
  y -= 22

  // Identité
  const boxH = 46
  page.drawRectangle({ x: M, y: y - boxH, width: right - M, height: boxH, color: PAPER, borderColor: LINE, borderWidth: 1 })
  const cols = [M + 14, M + (right - M) / 3 + 14, M + (2 * (right - M)) / 3 + 14]
  const ids: [string, string][] = [
    ['ENFANT', ctx.child.firstName],
    ['NÉE LE', d(ctx.child.birthDate)],
    ['ÂGE À CE JOUR', ageLabel(ctx.child.birthDate, ctx.today)],
  ]
  ids.forEach(([label, value], i) => {
    text(page, label, cols[i], y - 18, 7.5, f.bold, INK_MUTED)
    text(page, value, cols[i], y - 33, 12, f.bold)
  })
  y -= boxH + 24

  // Tableau
  text(page, 'VACCINATIONS ENREGISTRÉES', M, y, 8, f.bold, INK_MUTED)
  y -= 14
  // Largeurs calées sur le contenu réel : un numéro de lot ne doit jamais
  // être tronqué, c'est l'information qui sert en cas de rappel de lot.
  const colX = ctx.options.includeLots ? [M, M + 70, M + 262, M + 360] : [M, M + 70, M + 300]
  const heads = ctx.options.includeLots
    ? ['DATE', 'VALENCES', 'PRODUIT', 'N° DE LOT']
    : ['DATE', 'VALENCES', 'PRODUIT']
  heads.forEach((h, i) => text(page, h, colX[i], y - 9, 7.5, f.bold, INK_STRONG))
  const srcX = M + 442
  text(page, 'SOURCE', srcX, y - 9, 7.5, f.bold, INK_STRONG)
  y -= 15
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1, color: INK })

  if (ctx.live.length === 0) {
    y -= 22
    text(page, 'Aucune vaccination enregistrée à ce jour.', M, y, 10, f.regular, INK_MUTED)
    y -= 12
  }

  for (const e of ctx.live) {
    const rowH = 20
    if (!e.verifiedByUser) {
      page.drawRectangle({ x: M - 4, y: y - rowH + 4, width: right - M + 8, height: rowH, color: TINT })
    }
    const cells = ctx.options.includeLots
      ? [d(e.date), ctx.readable(e.valences), e.productName ?? '—', e.lotNumber ?? '—']
      : [d(e.date), ctx.readable(e.valences), e.productName ?? '—']
    cells.forEach((c, i) => {
      const max = (colX[i + 1] ?? srcX - 8) - colX[i] - 8
      let s = wa(c)
      while (f.regular.widthOfTextAtSize(s, 9.5) > max && s.length > 3) s = `${s.slice(0, -2)}…`
      text(page, s, colX[i], y - 13, 9.5, f.regular, e.verifiedByUser ? INK : INK_STRONG)
    })
    text(page, e.verifiedByUser ? 'Vérifié' : 'Non vérifié', srcX, y - 13, 8, f.bold, e.verifiedByUser ? OK : DUE)
    y -= rowH
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.6, color: LINE_SOFT })
  }

  const anyUnverified = ctx.live.some((e) => !e.verifiedByUser)
  if (anyUnverified) {
    y -= 16
    page.drawRectangle({ x: M, y: y - 1, width: 9, height: 9, color: TINT, borderColor: DUE, borderWidth: 0.7 })
    text(page, "Ligne sur fond teinté : information non confirmée par le détenteur du carnet.", M + 15, y, 8.5, f.regular, INK_STRONG)
    y -= 10
  }
  y -= 26

  // Deux encadrés de statut
  const half = (right - M - 16) / 2
  const sh = 74
  page.drawRectangle({ x: M, y: y - sh, width: half, height: sh, color: rgb(0.957, 0.976, 0.965), borderColor: rgb(0.827, 0.898, 0.859), borderWidth: 1 })
  text(page, 'OBLIGATIONS SATISFAITES', M + 12, y - 18, 7.5, f.bold, OK)
  text(page, `${ctx.statuses.satisfied} / ${ctx.statuses.total}`, M + 12, y - 42, 18, f.bold, OK)
  wrap(`valences obligatoires pour un enfant né le ${d(ctx.child.birthDate)}`, f.regular, 8, half - 24)
    .slice(0, 2).forEach((l, i) => text(page, l, M + 12, y - 56 - i * 10, 8, f.regular, INK_STRONG))

  const x2 = M + half + 16
  // Un encadré d'alerte vide est un contresens : quand il n'y a rien à faire,
  // le document doit le dire calmement.
  const none = ctx.remaining.length === 0
  page.drawRectangle({
    x: x2, y: y - sh, width: half, height: sh,
    color: none ? PAPER : rgb(0.992, 0.965, 0.953),
    borderColor: none ? LINE : rgb(0.953, 0.847, 0.804),
    borderWidth: 1,
  })
  text(page, 'RESTE À RÉALISER', x2 + 12, y - 18, 7.5, f.bold, none ? INK_MUTED : LATE)
  if (none) {
    text(page, 'Rien à réaliser à ce jour.', x2 + 12, y - 36, 10, f.regular, INK)
    wrap("Au regard du calendrier applicable et des dates enregistrées.", f.regular, 8, half - 24)
      .forEach((l, i) => text(page, l, x2 + 12, y - 50 - i * 10, 8, f.regular, INK_MUTED))
  } else {
    ctx.remaining.slice(0, 4).forEach((r, i) => {
      text(page, `${r.shortLabel} — dose ${r.doseNumber}, cible ${d(r.targetDate)}`, x2 + 12, y - 34 - i * 12, 8.5, f.regular, INK)
    })
    if (ctx.remaining.length > 4) {
      text(page, `et ${ctx.remaining.length - 4} autre(s).`, x2 + 12, y - 34 - 4 * 12, 8.5, f.regular, INK_MUTED)
    }
  }
  y -= sh + 24

  // Cartouche de contresignature
  if (ctx.options.includeSignature) {
    const ch = 124
    page.drawRectangle({ x: M, y: y - ch, width: right - M, height: ch, borderColor: rgb(0.780, 0.741, 0.776), borderWidth: 1, borderDashArray: [4, 3] })
    text(page, 'ATTESTATION DU PROFESSIONNEL DE SANTÉ', M + 14, y - 18, 7.5, f.bold, INK_MUTED)
    wrap("Ce récapitulatif ne fait foi qu'une fois daté, signé et tamponné ci-dessous par un médecin, une sage-femme ou un infirmier.", f.regular, 9, right - M - 28)
      .forEach((l, i) => text(page, l, M + 14, y - 32 - i * 11, 9, f.regular, INK_STRONG))
    // Le bloc de signature commence sous le texte, jamais dessus.
    const baseY = y - ch + 20
    text(page, 'Nom et qualité', M + 14, baseY + 8, 8, f.regular, INK_MUTED)
    page.drawLine({ start: { x: M + 14, y: baseY }, end: { x: M + 170, y: baseY }, thickness: 0.8, color: rgb(0.780, 0.741, 0.776) })
    text(page, 'Date', M + 190, baseY + 8, 8, f.regular, INK_MUTED)
    page.drawLine({ start: { x: M + 190, y: baseY }, end: { x: M + 300, y: baseY }, thickness: 0.8, color: rgb(0.780, 0.741, 0.776) })
    const sigH = 56
    page.drawRectangle({ x: right - 170, y: baseY - 8, width: 156, height: sigH, borderColor: LINE, borderWidth: 1 })
    text(page, 'Signature et cachet', right - 160, baseY + sigH - 20, 7.5, f.regular, INK_MUTED)
  }

  drawFooter(page, f, 1, ctx.total, ctx.options)
}

function drawFooter(page: PDFPage, f: Fonts, n: number, total: number, options: RecapOptions) {
  const { width } = page.getSize()
  const right = width - M
  page.drawLine({ start: { x: M, y: 62 }, end: { x: right, y: 62 }, thickness: 0.8, color: LINE })
  const notice = options.includeSignature
    ? "Document informatif, sans valeur légale ni opposable en l'absence de la signature ci-dessus. Établi par le détenteur du carnet à partir de ses propres saisies. Il ne remplace ni le carnet de santé officiel ni un certificat médical."
    : "Document informatif, sans valeur légale ni opposable. Établi par le détenteur du carnet à partir de ses propres saisies. Il ne remplace ni le carnet de santé officiel ni un certificat médical."
  wrap(notice, f.regular, 7.5, right - M - 60).forEach((l, i) => {
    page.drawText(wa(l), { x: M, y: 48 - i * 9.5, size: 7.5, font: f.regular, color: INK_MUTED })
  })
  const p = `Page ${n} / ${total}`
  page.drawText(wa(p), { x: right - f.regular.widthOfTextAtSize(wa(p), 8), y: 48, size: 8, font: f.regular, color: INK_MUTED })
}

async function drawPhotoPage(
  doc: PDFDocument, f: Fonts, bytes: Uint8Array, meta: AttachmentMeta,
  n: number, total: number, childName: string,
) {
  const page = doc.addPage(A4)
  const { width, height } = page.getSize()
  const img = await doc.embedJpg(bytes.slice().buffer as ArrayBuffer)

  text(page, `Page du carnet de santé — ${childName}`, M, height - M, 11, f.bold)
  text(page, `Photographiée le ${d(meta.capturedAt.slice(0, 10))}`, M, height - M - 15, 9, f.regular, INK_MUTED)

  const top = height - M - 34
  const bottom = 80
  const maxW = width - 2 * M
  const maxH = top - bottom
  const scale = Math.min(maxW / img.width, maxH / img.height)
  const w = img.width * scale
  const h = img.height * scale
  page.drawImage(img, { x: (width - w) / 2, y: top - h, width: w, height: h })

  drawFooter(page, f, n, total, { includePhotos: true, includeSignature: true, includeLots: true })
}

function ageLabel(birth: string, today: string): string {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months -= 1
  if (months < 24) return `${months} mois`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? `${years} ans` : `${years} ans et ${rest} mois`
}
