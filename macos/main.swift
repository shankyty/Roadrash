// Native macOS shell for Road Rash: Rickshaw Rumble.
// Hosts the canvas game (Resources/web) in a WKWebView window.
import Cocoa
import WebKit

final class GameWebView: WKWebView {
    override var acceptsFirstResponder: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let appName = "Road Rash: Rickshaw Rumble"

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default() // keeps localStorage (wallet, progress) between launches

        webView = GameWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 720), configuration: config)
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.autoresizingMask = [.width, .height]

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(srgbRed: 0.07, green: 0.043, blue: 0.11, alpha: 1)
        window.minSize = NSSize(width: 640, height: 400)
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("RoadRashMainWindow")
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)

        guard let web = Bundle.main.resourceURL?.appendingPathComponent("web") else { return }
        webView.loadFileURL(web.appendingPathComponent("index.html"), allowingReadAccessTo: web)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    @objc private func reloadGame(_ sender: Any?) { webView.reload() }
    @objc private func pauseGame(_ sender: Any?) { send("pause") }
    @objc private func restartRace(_ sender: Any?) { send("restart") }
    @objc private func quitToMenu(_ sender: Any?) { send("menu") }

    // Forwards a command to the game's window.rrrCommand (see web/game.js).
    private func send(_ command: String) {
        webView.evaluateJavaScript("window.rrrCommand && window.rrrCommand('\(command)')", completionHandler: nil)
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let gameItem = NSMenuItem()
        let gameMenu = NSMenu(title: "Game")
        let items: [(String, Selector, String, NSEvent.ModifierFlags)] = [
            ("Pause / Resume", #selector(pauseGame(_:)), "p", [.command]),
            ("Restart Race", #selector(restartRace(_:)), "r", [.command]),
            ("Quit to Main Menu", #selector(quitToMenu(_:)), "m", [.command, .shift]),
            ("Reload Game", #selector(reloadGame(_:)), "r", [.command, .shift]),
        ]
        for (i, (title, action, key, mods)) in items.enumerated() {
            if i == 3 { gameMenu.addItem(.separator()) }
            let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
            item.keyEquivalentModifierMask = mods
            item.target = self
            gameMenu.addItem(item)
        }
        gameItem.submenu = gameMenu
        main.addItem(gameItem)

        let viewItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let fs = NSMenuItem(title: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        viewMenu.addItem(fs)
        viewItem.submenu = viewMenu
        main.addItem(viewItem)

        let winItem = NSMenuItem()
        let winMenu = NSMenu(title: "Window")
        winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winItem.submenu = winMenu
        main.addItem(winItem)

        NSApp.mainMenu = main
        NSApp.windowsMenu = winMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
