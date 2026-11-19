import Foundation

/// Geometry, never a device-name guess. Rectangles use the view's safe-area coordinates.
struct CompanionLayoutPlan {
    enum Mode: Equatable { case compact, expanded, book, tabletop }
    let mode: Mode
    let header: CGRect
    let scene: CGRect
    let controls: CGRect

    init(size: CGSize, preferredControlsHeight: CGFloat = 200, divisions: [CGRect] = [], occlusions: [CGRect] = []) {
        let width = max(1, size.width), height = max(1, size.height)
        let full = CGRect(x: 0, y: 0, width: width, height: height)
        // Inner camera occlusions may be inside a window's ordinary safe area.
        let top = min(height * 0.25, occlusions.filter { $0.intersects(full) && $0.minY < height * 0.2 }
            .map { $0.maxY + 8 }.max() ?? 0)
        let bounds = CGRect(x: 0, y: top, width: width, height: height - top)
        let headerHeight = min(60.0, bounds.height * 0.25)
        let padding = width < 360 ? 12.0 : 20.0
        if let fold = divisions.map({ $0.intersection(bounds) }).first(where: { !$0.isNull && $0.width > 0 && $0.height > 0 }) {
            if fold.height > fold.width && fold.minX >= 140 && width - fold.maxX >= 160 {
                mode = .book
                scene = CGRect(x: 0, y: top, width: max(1, fold.minX - 12), height: bounds.height)
                let x = fold.maxX + 12, w = max(1, width - x)
                header = CGRect(x: x, y: top, width: w, height: headerHeight)
                controls = CGRect(x: x + 8, y: top + headerHeight, width: max(1, w - 16), height: max(1, bounds.height - headerHeight - 12))
                return
            } else if fold.width > fold.height && fold.minY - top >= 120 && height - fold.maxY >= 160 {
                mode = .tabletop
                scene = CGRect(x: 0, y: top, width: width, height: max(1, fold.minY - top - 12))
                let y = fold.maxY + 12
                header = CGRect(x: 0, y: y, width: width, height: headerHeight)
                controls = CGRect(x: padding, y: y + headerHeight, width: max(1, width - padding * 2), height: max(1, height - y - headerHeight - 12))
                return
            }
        }
        header = CGRect(x: 0, y: top, width: width, height: headerHeight)
        let contentY = top + headerHeight, contentHeight = max(1, height - contentY)
        if width >= 620 {
            mode = .expanded
            let controlsWidth = min(400, width * 0.43)
            scene = CGRect(x: 0, y: contentY, width: max(1, width - controlsWidth - padding * 2), height: contentHeight)
            controls = CGRect(x: width - controlsWidth - padding, y: contentY + 8,
                              width: controlsWidth, height: max(1, contentHeight - 20))
        } else {
            mode = .compact
            let controlsHeight = min(max(160, preferredControlsHeight), contentHeight * 0.50)
            scene = CGRect(x: 0, y: contentY, width: width, height: max(1, contentHeight - controlsHeight - 12))
            controls = CGRect(x: padding, y: height - controlsHeight - 8, width: max(1, width - padding * 2), height: controlsHeight)
        }
    }
}
