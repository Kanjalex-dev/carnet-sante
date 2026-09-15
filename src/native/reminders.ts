import { LocalNotifications } from '@capacitor/local-notifications'
import { planReminders } from './reminderPlan'
import { isNative } from './platform'
import type { DoseStatus } from '../domain/types'
import type { ISODate } from '../domain/dates'

/**
 * Branche le plan de rappels (pur, dans reminderPlan.ts) sur l'API native.
 * Sur le web, cette fonction ne fait rien : les rappels natifs n'existent
 * que dans l'app iOS. L'export .ics reste la solution sur le web.
 */

let permissionAsked = false

export async function syncReminders(doses: DoseStatus[], today: ISODate): Promise<void> {
  if (!isNative()) return

  if (!permissionAsked) {
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') {
      const req = await LocalNotifications.requestPermissions()
      if (req.display !== 'granted') return
    }
    permissionAsked = true
  }

  // On reprogramme tout à chaque appel plutôt que de calculer un diff :
  // le volume est faible (quelques dizaines de notifications au plus), et
  // un identifiant stable évite les doublons — voir reminderPlan.ts.
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications })
  }

  const plan = planReminders(doses, today)
  if (plan.length === 0) return

  await LocalNotifications.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: r.at },
      sound: undefined,
    })),
  })
}
