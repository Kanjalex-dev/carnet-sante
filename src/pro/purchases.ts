import { isPro as readPro, setPro } from '../storage/repository'
import { isNative } from '../native/platform'

/**
 * Achat unique, à vie — pas d'abonnement.
 *
 * Le branchement réel passe par RevenueCat (StoreKit géré, reçu vérifié côté
 * Apple) une fois le compte App Store Connect et le produit créés. En
 * attendant cette étape, `purchasePro` lève : rien ne doit pouvoir simuler un
 * achat qui n'a pas eu lieu.
 *
 * `PRODUCT_ID` doit correspondre exactement à l'identifiant créé dans
 * App Store Connect (Function > App Store > Achats intégrés).
 */
export const PRODUCT_ID = 'com.iedigital.carnet.pro'

export class PurchaseUnavailableError extends Error {}
export class PurchaseCancelledError extends Error {}

export async function isPro(): Promise<boolean> {
  return readPro()
}

export async function purchasePro(): Promise<void> {
  if (!isNative()) throw new PurchaseUnavailableError('Achat disponible uniquement dans l’app iOS.')

  // TODO(RevenueCat) : brancher ici Purchases.purchaseStoreProduct(PRODUCT_ID)
  // une fois le SDK installé et le produit créé côté App Store Connect.
  // La réussite de l'achat, vérifiée par le reçu Apple via RevenueCat, est
  // ce qui doit appeler setPro(true) — jamais un simple clic côté interface.
  throw new PurchaseUnavailableError(
    'Le catalogue d’achats n’est pas encore configuré. Revenez une fois l’app publiée.',
  )
}

/** Restauration — obligatoire par les règles Apple pour tout achat non consommable. */
export async function restorePurchases(): Promise<boolean> {
  if (!isNative()) return false
  // TODO(RevenueCat) : Purchases.restorePurchases(), puis setPro() selon le résultat.
  return false
}

export { setPro }
