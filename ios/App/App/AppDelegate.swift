import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        excludeHealthDataFromICloudBackup()
        return true
    }

    /// Exclut de la sauvegarde iCloud les dossiers ou la WKWebView stocke
    /// IndexedDB et le stockage local.
    ///
    /// La guideline 5.1.3 (ii) de l'App Store interdit de stocker des donnees
    /// de sante personnelles dans iCloud. Sans cette exclusion, le contenu du
    /// carnet — vaccinations, mesures, photos du carnet papier — part dans la
    /// sauvegarde iCloud de l'appareil par defaut, ce qui contredit a la fois
    /// la guideline et la promesse faite a l'utilisateur : « aucune donnee de
    /// ce carnet ne quitte votre appareil ».
    ///
    /// Appele a chaque lancement, et non une seule fois : iOS recree ces
    /// dossiers, et l'attribut se perd a la recreation.
    private func excludeHealthDataFromICloudBackup() {
        let fileManager = FileManager.default
        guard let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            return
        }

        // WebKit/ couvre IndexedDB et LocalStorage de la WKWebView.
        // Application Support/ couvre ce que les plugins Capacitor y deposent.
        let sensitive = [
            library.appendingPathComponent("WebKit", isDirectory: true),
            library.appendingPathComponent("Application Support", isDirectory: true),
        ]

        for url in sensitive {
            guard fileManager.fileExists(atPath: url.path) else { continue }
            var target = url
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            do {
                try target.setResourceValues(values)
            } catch {
                // Un echec n'empeche pas le lancement : on ne bloque jamais
                // l'acces au carnet pour un attribut de sauvegarde.
                NSLog("Carnet: exclusion iCloud impossible pour \(url.lastPathComponent) — \(error)")
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
