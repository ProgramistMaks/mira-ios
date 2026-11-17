import SwiftUI
import WebKit
import Combine

struct AvatarView: UIViewRepresentable {
    let phase: CompanionPhase
    var characterID: String = "vita"
    let voice: VoiceService
    let reduceMotion: Bool
    let frameRate: Int
    let active: Bool
    @Binding var screenMaximumFPS: Int
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
        init(parent: AvatarView) { self.parent = parent }
        func update(_ view: WKWebView) {
            if assets.characterID != parent.characterID {
                assets.characterID = parent.characterID
                loaded = false; lastCommand = nil; mouthBridge?.reset(); parent.voice.setSceneActive(false)
                view.reload(); return
            }
            let visible = loaded && parent.ready && parent.active
            mouthBridge?.setState(ready: loaded && parent.ready, active: parent.active)
            parent.voice.setSceneActive(visible)
            guard loaded else { return }
            let command = """
                window.companion?.setState('\(parent.phase.rawValue)', \(parent.reduceMotion));
                window.companion?.setFrameRate(\(parent.frameRate));
                window.companion?.setActive(\(parent.active));
                """
            guard command != lastCommand else { return }; lastCommand = command
            view.evaluateJavaScript(command, completionHandler: nil)
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: String], message.frameInfo.isMainFrame else { return }
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
            loaded = false; lastCommand = nil; parent.ready = false; mouthBridge?.reset()
            parent.voice.setSceneActive(false); webView.reload()
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.scheme == "companion" ? .allow : .cancel)
        }
    }
}

private final class AvatarWebView: WKWebView {
    private var previousSize: CGSize = .zero
    private var previousScreenRate: Int?
    var onScreenRateChange: ((Int) -> Void)?
    override func didMoveToWindow() { super.didMoveToWindow(); syncScreenRate() }
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
