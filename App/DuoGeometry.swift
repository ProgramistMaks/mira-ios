import SwiftUI

/// Enabled by the build scripts only when the selected SDK exposes Duo APIs.
/// Older builds keep size-based layouts; they do not pretend to detect a hinge.
enum DuoGeometry {
    static func divisions(in proxy: GeometryProxy) -> [CGRect] {
        #if MIRA_DUO_SDK
        if #available(iOS 27.1, *) { return proxy.reservedRegions(kind: .division).map(\.frame) }
        #endif
        return []
    }
    static func occlusions(in proxy: GeometryProxy) -> [CGRect] {
        #if MIRA_DUO_SDK
        if #available(iOS 27.1, *) { return proxy.reservedRegions(kind: .occlusion).map(\.frame) }
        #endif
        return []
    }
}

extension View {
    func placed(in rect: CGRect) -> some View {
        frame(width: rect.width, height: rect.height).position(x: rect.midX, y: rect.midY)
    }
}
