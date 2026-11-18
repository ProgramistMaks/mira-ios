import SwiftUI
import WebKit
import QuartzCore
import Combine

struct AvatarView: UIViewRepresentable {
    let phase: CompanionPhase
    var characterID: String = "vita"
    var expressionEmotion = "auto"
    var expressionIntensity = 0.7
    var motionClip = "auto"
    var motionReplay = 0
    var danceRequest = 0
    var expressionsEnabled = true
    var bodyMode = "natural"
    var bodyControls = "{}"
    var secondaryPhysics = true
    var physicsWind = 0.0
    var physicsSoftness = 0.5
    var hairDetail = "standard"
    let voice: VoiceService
    let reduceMotion: Bool
    let frameRate: Int
    let active: Bool
    @Binding var screenMaximumFPS: Int
    @Binding var lastRenderRate: Int?
    @Binding var ready: Bool
    @Binding var error: String?

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(context.coordinator.assets, forURLScheme: "companion")
        context.coordinator.assets.characterID = characterID
        configuration.userContentController.add(context.coordinator, name: "avatar")
        let view = AvatarWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false; view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.onScreenRateChange = { [weak coordinator = context.coordinator] maximum in
            // Window/layout callbacks can occur during a SwiftUI update.
            Task { @MainActor in coordinator?.parent.screenMaximumFPS = maximum }
        }
        let bridge = MouthBridge { [weak view] frame, finish in
            guard let view else { finish(); return }
            view.evaluateJavaScript("window.companion?.setSpeech(\(frame.level), \(frame.sampledAt), \(frame.sequence))") { _, _ in
                Task { @MainActor in finish() }
            }
        }
        context.coordinator.mouthBridge = bridge
        context.coordinator.mouthSubscription = voice.mouthEvents.sink { [weak bridge] level in bridge?.submit(level) }
        view.load(URLRequest(url: URL(string: "companion://local/index.html")!))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.update(view)
    }
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "avatar")
        coordinator.mouthSubscription?.cancel()
        coordinator.mouthBridge?.reset()
        coordinator.parent.voice.setSceneActive(false)
        (view as? AvatarWebView)?.setDisplayRate(0)
        (view as? AvatarWebView)?.onScreenRateChange = nil
        view.stopLoading()
    }
    @MainActor
    class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: AvatarView
        var loaded = false
        private var lastCommand: String?
        let assets = BundleScheme()
        var mouthSubscription: AnyCancellable?
        var mouthBridge: MouthBridge?
        private var lastReplay: Int
        private var lastDance: Int
        init(parent: AvatarView) {
            self.parent = parent
            lastReplay = parent.motionReplay
            lastDance = parent.danceRequest
        }
        func update(_ view: WKWebView) {
            if assets.characterID != parent.characterID {
                assets.characterID = parent.characterID
                loaded = false; lastCommand = nil; mouthBridge?.reset(); parent.voice.setSceneActive(false)
                view.reload(); return
            }
            let visible = loaded && parent.ready && parent.active
            (view as? AvatarWebView)?.setDisplayRate(visible && !parent.reduceMotion ? parent.frameRate : 0)
            mouthBridge?.setState(ready: loaded && parent.ready, active: parent.active)
            parent.voice.setSceneActive(visible)
            guard loaded else { return }
            let settings: [String: Any] = ["emotion": parent.expressionEmotion,
                "intensity": parent.expressionIntensity.isFinite ? parent.expressionIntensity : 0.7,
                "variant": -1, "enabled": parent.expressionsEnabled]
            let encoded = (try? JSONSerialization.data(withJSONObject: settings, options: [.sortedKeys])) ?? Data("{}".utf8)
            let performance = String(decoding: encoded, as: UTF8.self)
            let controls = parent.bodyControls.utf8.count <= 32000
                ? (try? JSONDecoder().decode([String: Double].self, from: Data(parent.bodyControls.utf8))) ?? [:] : [:]
            let bodySettings: [String: Any] = ["mode": parent.bodyMode, "clip": parent.motionClip, "controls": controls,
                "physics": parent.secondaryPhysics, "wind": parent.physicsWind.isFinite ? parent.physicsWind : 0,
                "softness": parent.physicsSoftness.isFinite ? parent.physicsSoftness : 0.5, "detail": parent.hairDetail]
            let bodyData = (try? JSONSerialization.data(withJSONObject: bodySettings, options: [.sortedKeys])) ?? Data("{}".utf8)
            let bodyJSON = String(decoding: bodyData, as: UTF8.self)
            let command = """
                window.companion?.configureBody(\(bodyJSON));
                window.companion?.configurePerformance(\(performance));
                window.companion?.configureChoreography((\(bodyJSON)).clip);
                window.companion?.setState('\(parent.phase.rawValue)', \(parent.reduceMotion));
                window.companion?.setFrameRate(\(parent.frameRate));
                window.companion?.setActive(\(parent.active));
                """
            if command != lastCommand {
                lastCommand = command
                view.evaluateJavaScript(command, completionHandler: nil)
            }
            guard visible else { return }
            if lastReplay != parent.motionReplay {
                lastReplay = parent.motionReplay
                view.evaluateJavaScript("window.companion?.replayGesture()", completionHandler: nil)
            }
            if lastDance != parent.danceRequest {
                lastDance = parent.danceRequest
                view.evaluateJavaScript("window.companion?.dance()", completionHandler: nil)
            }
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: String], message.frameInfo.isMainFrame else { return }
            if body["type"] == "cadence", let fps = Int(body["fps"] ?? ""), (0...300).contains(fps) {
                if parent.lastRenderRate != fps { parent.lastRenderRate = fps }
                return
            }
            if body["type"] == "ready" {
                parent.ready = true; parent.error = nil
                (message.webView as? AvatarWebView)?.syncViewport(force: true)
                if let view = message.webView { update(view) }
            }
            if body["type"] == "error" {
                parent.ready = false; mouthBridge?.reset(); parent.voice.setSceneActive(false)
                parent.error = "Не удалось загрузить персонажа. Выбери Vita в настройках персонажей."
            }
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            (webView as? AvatarWebView)?.setDisplayRate(0)
            parent.lastRenderRate = nil
            loaded = false; lastCommand = nil; parent.ready = false; mouthBridge?.reset(); parent.voice.setSceneActive(false)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true; update(webView)
            (webView as? AvatarWebView)?.syncViewport(force: true)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loaded = false; mouthBridge?.reset(); parent.voice.setSceneActive(false)
            parent.error = "Не удалось открыть сцену персонажа."
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            (webView as? AvatarWebView)?.setDisplayRate(0)
            loaded = false; lastCommand = nil; parent.ready = false; mouthBridge?.reset()
            parent.voice.setSceneActive(false); webView.reload()
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.scheme == "companion" ? .allow : .cancel)
        }
    }
}

@MainActor
private final class AvatarDisplayTarget: NSObject {
    weak var view: AvatarWebView?
    @objc func tick(_ link: CADisplayLink) { view?.drawDisplayFrame(link) }
}

private final class AvatarWebView: WKWebView {
    private let displayTarget = AvatarDisplayTarget()
    private var displayLink: CADisplayLink?
    private var preferredRate = 0
    private var frameInFlight = false

    func setDisplayRate(_ requested: Int) {
        let rate = min(requested, window?.screen.maximumFramesPerSecond ?? 0)
        let preferred = rate > 60 ? rate : 0
        guard preferred != preferredRate else { return }
        preferredRate = preferred
        if preferred == 0 {
            displayLink?.invalidate()
            displayLink = nil
            frameInFlight = false
            evaluateJavaScript("window.companion?.releaseDisplayClock()", completionHandler: nil)
            return
        }
        displayTarget.view = self
        let link = displayLink ?? CADisplayLink(target: displayTarget, selector: #selector(AvatarDisplayTarget.tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: Float(min(80, preferred)), maximum: Float(preferred), preferred: Float(preferred))
        if displayLink == nil {
            displayLink = link
            link.add(to: .main, forMode: .common)
        }
    }

    func drawDisplayFrame(_ link: CADisplayLink) {
        guard link === displayLink, !frameInFlight else { return }
        frameInFlight = true
        let milliseconds = link.targetTimestamp * 1000
        evaluateJavaScript("window.companion?.renderDisplayFrame(\(milliseconds))") { [weak self, weak link] _, _ in
            guard let self, let link, link === self.displayLink else { return }
            self.frameInFlight = false
        }
    }

    private var previousSize: CGSize = .zero
    private var previousScreenRate: Int?
    var onScreenRateChange: ((Int) -> Void)?
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { setDisplayRate(0) }
        syncScreenRate()
    }
    override func layoutSubviews() { super.layoutSubviews(); syncScreenRate(); syncViewport() }
    private func syncScreenRate() {
        guard let screen = window?.screen else { return }
        let maximum = max(1, screen.maximumFramesPerSecond)
        guard maximum != previousScreenRate else { return }
        previousScreenRate = maximum; onScreenRateChange?(maximum)
    }
    func syncViewport(force: Bool = false) {
        let size = bounds.size
        guard size.width > 0, size.height > 0, force || size != previousSize else { return }
        previousSize = size
        evaluateJavaScript("window.companion?.setViewport(\(Double(size.width)), \(Double(size.height)))", completionHandler: nil)
    }
}

/// Bundled renderer and selected validated local VRM; the bridge receives animation state and mouth amplitude, never keys or text.
final class BundleScheme: NSObject, WKURLSchemeHandler {
    var characterID = "vita"
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let root = Bundle.main.resourceURL?.appendingPathComponent("Web"),
              url.host == "local" else {
            urlSchemeTask.didFailWithError(URLError(.badURL)); return
        }
        let bundled = root.appendingPathComponent(url.path).standardizedFileURL
        guard bundled.path.hasPrefix(root.standardizedFileURL.path + "/") else { urlSchemeTask.didFailWithError(URLError(.badURL)); return }
        let file = url.path == "/character.vrm" ? (CharacterFiles.file(for: characterID) ?? bundled) : bundled
        guard let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let types = ["html": "text/html", "js": "application/javascript", "vrm": "model/gltf-binary"]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": types[file.pathExtension] ?? "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
            "Content-Length": String(data.count)
        ])!
        urlSchemeTask.didReceive(response); urlSchemeTask.didReceive(data); urlSchemeTask.didFinish()
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
