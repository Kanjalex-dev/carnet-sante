import { InAppReview } from '@capacitor-community/in-app-review'
import { hasShownReviewPrompt, markReviewPromptShown } from '../storage/repository'
import { isNative } from './platform'

/**
 * Sollicite l'avis App Store une seule fois dans la vie de l'app, au bon
 * moment : après un deuxième enregistrement de vaccination, pas au premier
 * (trop tôt, l'utilisateur ne sait pas encore si l'app lui sert) et pas sur
 * un écran d'erreur ou de suppression. StoreKit impose de toute façon sa
 * propre limite (3 demandes / 365 jours) ; notre garde-fou local sert
 * surtout à ne jamais harceler un utilisateur satisfait qui a déjà répondu.
 *
 * No-op sur web : la sollicitation n'a de sens que dans l'app native, où
 * StoreKit peut afficher la fenêtre système.
 */
export async function maybeRequestReview(vaccinationCount: number): Promise<void> {
  if (!isNative()) return
  if (vaccinationCount < 2) return
  if (await hasShownReviewPrompt()) return

  await markReviewPromptShown()
  try {
    await InAppReview.requestReview()
  } catch {
    // StoreKit peut refuser silencieusement (quota atteint, contexte non
    // éligible) — ce n'est jamais une erreur à remonter à l'utilisateur.
  }
}
