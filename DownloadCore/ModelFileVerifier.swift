import Foundation

struct ModelVerificationProgress: Sendable {
    let checked: Int64
    let total: Int64
    var fraction: Double { min(1, max(0, Double(checked) / Double(total))) }
}

/// Reads bounded chunks off the UI actor. The app supplies CryptoKit SHA256;
/// neither the partial file nor its resume checkpoint is changed here.
enum ModelFileVerifier {
    static func verify(file: URL, expectedBytes: Int64,
                       update: (Data) -> Void, matches: () -> Bool,
                       progress: (ModelVerificationProgress) -> Void = { _ in }) throws -> Bool {
        try Task.checkCancellation()
        guard expectedBytes > 0 else { return false }
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var checked: Int64 = 0
        var lastProgress = ContinuousClock.now
        progress(.init(checked: 0, total: expectedBytes))
        while true {
            try Task.checkCancellation()
            guard let data = try handle.read(upToCount: 1_048_576), !data.isEmpty else { break }
            try Task.checkCancellation()
            guard Int64(data.count) <= expectedBytes - checked else { return false }
            update(data); checked += Int64(data.count)
            let now = ContinuousClock.now
            if lastProgress.duration(to: now) >= .milliseconds(150) {
                progress(.init(checked: checked, total: expectedBytes)); lastProgress = now
            }
        }
        try Task.checkCancellation()
        guard checked == expectedBytes, matches() else { return false }
        try Task.checkCancellation()
        progress(.init(checked: checked, total: expectedBytes))
        return true
    }
}
