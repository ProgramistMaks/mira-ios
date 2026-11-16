import Foundation
import Combine
import CryptoKit

enum LocalModelFile {
    static func directory() throws -> URL {
        var url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true).appendingPathComponent("LocalModels", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try url.setResourceValues(values)
        return url
    }
    static func installed(_ model: LocalModelSpec) throws -> URL {
        // Preserve the first 9B download made before the catalogue was added.
        let filename = model.id == "qwen35-9b-q4" ? "qwen3.5-9b-q4_k_m.gguf" : model.filename
        return try directory().appendingPathComponent(filename)
    }
    static func legacy() throws -> URL { try directory().appendingPathComponent("qwen2.5-1.5b-q4.gguf") }
}

@MainActor
final class LocalModelStore: ObservableObject {
    @Published private(set) var selected: LocalModelSpec
    @Published private(set) var installedIDs: Set<String> = []
    var installed: Bool { installedIDs.contains(selected.id) }
    @Published private(set) var legacyInstalled = false
    @Published private(set) var downloading = false
    @Published private(set) var verifying = false
    @Published private(set) var progress = 0.0
    @Published var error: String?
    private var work: Task<Void, Never>?
    private let preferences: UserDefaults
    init(preferences: UserDefaults = .standard) {
        self.preferences = preferences
        selected = preferences.string(forKey: "selectedLocalModel").flatMap(LocalModelCatalog.find)
            ?? LocalModelCatalog.defaultModel
        refresh()
    }
    func select(_ model: LocalModelSpec) {
        guard !downloading else { return }
        selected = model; error = nil
        preferences.set(model.id, forKey: "selectedLocalModel")
    }
    func refresh() {
        installedIDs = Set(LocalModelCatalog.models.filter {
            (try? LocalModelFile.installed($0).resourceValues(forKeys: [.fileSizeKey]).fileSize) == Int($0.bytes)
        }.map(\.id))
        legacyInstalled = (try? LocalModelFile.legacy()).map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }
    func download() {
        guard !downloading && !installed else { return }
        let model = selected
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
                let directory = try LocalModelFile.directory()
                let capacity = try directory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
                    .volumeAvailableCapacityForImportantUsage
                // Download and final model share a volume; reserve 1 GB beyond the file.
                if let capacity, capacity < model.requiredDiskBytes {
                    throw NSError(domain: "LocalModel", code: 1, userInfo: [NSLocalizedDescriptionKey:
                        "Для загрузки нужно ещё не менее \(ByteCountFormatter.string(fromByteCount: model.requiredDiskBytes, countStyle: .decimal)) свободного места."])
                }
                let delegate = DownloadProgress(expectedBytes: model.bytes) { [weak self] value in Task { @MainActor in self?.progress = value } }
                let (temporary, response) = try await session.download(from: model.downloadURL, delegate: delegate)
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
                    return count == model.bytes && digest == model.sha256
                }
                let valid = try await withTaskCancellationHandler { try await verification.value } onCancel: { verification.cancel() }
                try Task.checkCancellation()
                guard valid else { throw CompanionError.invalidResponse }
                let destination = try LocalModelFile.installed(model)
                if FileManager.default.fileExists(atPath: destination.path) {
                    _ = try FileManager.default.replaceItemAt(destination, withItemAt: staging)
                } else {
                    try FileManager.default.moveItem(at: staging, to: destination)
                }
                staged = nil; self.refresh()
            } catch {
                if !Task.isCancelled { self.error = "Не удалось загрузить модель: \(error.localizedDescription)" }
            }
        }
    }
    func cancel() { work?.cancel() }
    func removeLegacy() {
        do { try FileManager.default.removeItem(at: LocalModelFile.legacy()); refresh() }
        catch { self.error = error.localizedDescription }
    }
    func remove() {
        guard !downloading else { return }
        do { try FileManager.default.removeItem(at: LocalModelFile.installed(selected)); refresh() }
        catch { self.error = error.localizedDescription }
    }
}

private final class DownloadProgress: NSObject, URLSessionDownloadDelegate {
    let update: @Sendable (Double) -> Void
    let expectedBytes: Int64
    init(expectedBytes: Int64, update: @escaping @Sendable (Double) -> Void) {
        self.expectedBytes = expectedBytes; self.update = update
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        update(min(1, Double(totalBytesWritten) / Double(expectedBytes)))
    }
}
