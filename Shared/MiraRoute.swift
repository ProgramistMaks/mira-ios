import Foundation

enum MiraRoute: String, CaseIterable {
    case chat, commands, settings

    var url: URL { URL(string: "mira://\(rawValue)")! }

    init?(url: URL) {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "mira", parts.user == nil, parts.password == nil,
              parts.port == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              let host = parts.host, let route = Self(rawValue: host.lowercased()) else { return nil }
        self = route
    }
}
