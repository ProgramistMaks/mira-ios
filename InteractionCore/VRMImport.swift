import Foundation

/// Imported avatars must be self-contained GLB/VRM, not network fetch instructions.
enum VRMImport {
    static let maximumBytes = 64 * 1024 * 1024
    static func validate(_ data: Data) throws {
        func fail() -> RoutineError { .invalid("Нужен встроенный файл VRM 0.x или 1.0 до 64 МБ, с моделью и текстурами внутри.") }
        guard data.count >= 20, data.count <= maximumBytes else { throw fail() }
        func uint32(_ offset: Int) -> Int { (0..<4).reduce(0) { $0 | (Int(data[offset + $1]) << ($1 * 8)) } }
        guard uint32(0) == 0x46546c67, uint32(4) == 2, uint32(8) == data.count,
              uint32(16) == 0x4e4f534a else { throw fail() }
        let length = uint32(12)
        guard length > 0, length <= 4_000_000, length <= data.count - 20 else { throw fail() }
        let document = try JSONSerialization.jsonObject(with: data.subdata(in: 20..<(20 + length)))
        guard let json = document as? [String: Any], let extensions = json["extensions"] as? [String: Any],
              let vrm = (extensions["VRM"] ?? extensions["VRMC_vrm"]) as? [String: Any],
              vrm["humanoid"] is [String: Any] else { throw fail() }
        for key in ["buffers", "images"] {
            for entry in json[key] as? [[String: Any]] ?? [] {
                if let uri = entry["uri"] as? String, !uri.hasPrefix("data:") { throw fail() }
            }
        }
        let accessors = json["accessors"] as? [[String: Any]] ?? []
        guard accessors.allSatisfy({ ($0["count"] as? Int ?? 0) <= 2_000_000 }) else {
            throw RoutineError.invalid("Эта модель слишком сложная для мобильной сцены.")
        }
    }
}
