import SwiftUI
import WebKit

struct AvatarView: UIViewRepresentable {
    let phase: CompanionPhase
    let reduceMotion: Bool
    @Binding var ready: Bool
    @Binding var error: String?

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundleScheme(), forURLScheme: "companion")
        configuration.userContentController.add(context.coordinator, name: "avatar")
        let view = AvatarWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false; view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear; view.scrollView.isScrollEnabled = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: URL(string: "companion://local/index.html")!))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.update(view)
    }
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "avatar")
        view.stopLoading()
    }
    class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: AvatarView
        var loaded = false
        init(parent: AvatarView) { self.parent = parent }
        func update(_ view: WKWebView) {
            guard loaded else { return }
            view.evaluateJavaScript("window.companion?.setState('\(parent.phase.rawValue)', \(parent.reduceMotion))", completionHandler: nil)
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: String], message.frameInfo.isMainFrame else { return }
            if body["type"] == "ready" {
                parent.ready = true; parent.error = nil
                (message.webView as? AvatarWebView)?.syncViewport(force: true)
            }
            if body["type"] == "error" { parent.ready = false; parent.error = "Не удалось загрузить персонажа. Попробуй перезапустить приложение." }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true; update(webView)
            (webView as? AvatarWebView)?.syncViewport(force: true)
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.error = "Не удалось открыть сцену персонажа."
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            loaded = false; parent.ready = false; webView.reload()
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(navigationAction.request.url?.scheme == "companion" ? .allow : .cancel)
        }
    }
}

private final class AvatarWebView: WKWebView {
    private var previousSize: CGSize = .zero
    override func layoutSubviews() { super.layoutSubviews(); syncViewport() }
    func syncViewport(force: Bool = false) {
        let size = bounds.size
        guard size.width > 0, size.height > 0, force || size != previousSize else { return }
        previousSize = size
        evaluateJavaScript("window.companion?.setViewport(\(Double(size.width)), \(Double(size.height)))", completionHandler: nil)
    }
}

/// Only bundled files; this view never receives API keys or chat text.
private final class BundleScheme: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              let root = Bundle.main.resourceURL?.appendingPathComponent("Web"),
              url.host == "local" else {
            urlSchemeTask.didFailWithError(URLError(.badURL)); return
        }
        let file = root.appendingPathComponent(url.path).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"),
              let data = try? Data(contentsOf: file) else {
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
