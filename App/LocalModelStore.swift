import Foundation
import Combine
import CryptoKit

enum LocalModelFile {
    static let name = "Qwen2.5 1.5B Instruct · Q4_K_M"
    static let bytes: Int64 = 1_117_320_736
    static let sha256 = "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"
    static let downloadURL = URL(string: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf")!
    static func directory() throws -> URL {
        var url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true).appendingPathComponent("LocalModels", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        return url
    }
    static func installed() throws -> URL { try directory().appendingPathComponent("qwen2.5-1.5b-q4.gguf") }
}

@MainActor
final class LocalModelStore: ObservableObject {
    @Published private(set) var installed = false
    @Published private(set) var downloading = false
    @Published private(set) var verifying = false
    @Published private(set) var progress = 0.0
    @Published var error: String?
    private var work: Task<Void, Never>?
    init() { refresh() }
    func refresh() {
        installed = (try? LocalModelFile.installed()).map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }
    func download() {
        guard !downloading && !installed else { return }
        downloading = true; progress = 0; error = nil
        work = Task { [weak self] in
            guard let self else { return }
            let config = URLSessionConfiguration.ephemeral
            config.allowsCellularAccess = false; config.allowsExpensiveNetworkAccess = false
            config.timeoutIntervalForRequest = 60; config.timeoutIntervalForResource = 7200
            let session = URLSession(configuration: config)
            defer { session.invalidateAndCancel(); self.downloading = false; self.verifying = false; self.work = nil }
            var staged: URL?
            defer { if let staged { try? FileManager.default.removeItem(at: staged) } }
            do {
                let delegate = DownloadProgress { [weak self] value in Task { @MainActor in self?.progress = value } }
                let (temporary, response) = try await session.download(from: LocalModelFile.downloadURL, delegate: delegate)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw CompanionError.invalidResponse }
                try Task.checkCancellation()
                let staging = try LocalModelFile.directory().appendingPathComponent(UUID().uuidString + ".download")
                try FileManager.default.moveItem(at: temporary, to: staging); staged = staging
                self.verifying = true
                let verification = Task.detached(priority: .utility) {
                    let handle = try FileHandle(forReadingFrom: staging); defer { try? handle.close() }
                    var hash = SHA256(); var count: Int64 = 0
                    while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty {
                        try Task.checkCancellation(); hash.update(data: data); count += Int64(data.count)
                    }
                    let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
                    return count == LocalModelFile.bytes && digest == LocalModelFile.sha256
                }
                let valid = try await withTaskCancellationHandler { try await verification.value } onCancel: { verification.cancel() }
                try Task.checkCancellation()
                guard valid else { throw CompanionError.invalidResponse }
                try FileManager.default.moveItem(at: staging, to: LocalModelFile.installed())
                staged = nil; self.refresh()
            } catch {
                if !Task.isCancelled { self.error = "Не удалось загрузить модель: \(error.localizedDescription)" }
            }
        }
    }
    func cancel() { work?.cancel() }
    func remove() {
        guard !downloading else { return }
        do { try FileManager.default.removeItem(at: LocalModelFile.installed()); refresh() }
        catch { self.error = error.localizedDescription }
    }
}

private final class DownloadProgress: NSObject, URLSessionDownloadDelegate {
    let update: @Sendable (Double) -> Void
    init(update: @escaping @Sendable (Double) -> Void) { self.update = update }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        update(min(1, Double(totalBytesWritten) / Double(LocalModelFile.bytes)))
    }
}
