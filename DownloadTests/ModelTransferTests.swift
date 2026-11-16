import XCTest
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import MiraDownloadCore

final class ModelTransferTests: XCTestCase {
    private var directory: URL!
    private var server: Process!
    private var baseURL: URL!
    private let size: Int64 = 1_048_576

    override func setUp() async throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("mira-transfer-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let port = directory.appendingPathComponent("port")
        let script = try XCTUnwrap(Bundle.module.url(forResource: "server", withExtension: "py", subdirectory: "Fixtures"))
        let diagnosticURL = directory.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: diagnosticURL.path, contents: nil)
        let diagnostics = try FileHandle(forWritingTo: diagnosticURL)
        defer { try? diagnostics.close() }
        server = Process(); server.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        server.arguments = ["python3", "-u", script.path, port.path]
        server.standardOutput = diagnostics; server.standardError = diagnostics
        try server.run()
        // Cold Python imports on a busy hosted Mac can exceed two seconds.
        let deadline = ContinuousClock.now.advanced(by: .seconds(20))
        while ContinuousClock.now < deadline {
            if let value = try? String(contentsOf: port, encoding: .utf8), let number = Int(value) {
                baseURL = URL(string: "http://127.0.0.1:\(number)")!; return
            }
            if !server.isRunning { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        let state = server.isRunning ? "startup timed out" : "exit status \(server.terminationStatus)"
        let log = (try? String(contentsOf: diagnosticURL, encoding: .utf8)) ?? "No diagnostics"
        throw NSError(domain: "ModelTransferTests", code: 1, userInfo: [NSLocalizedDescriptionKey:
            "Local HTTP fixture did not start (\(state)): \(log.prefix(4_000))"])
    }

    override func tearDown() {
        if server?.isRunning == true { server.terminate(); server.waitUntilExit() }
        if let directory { try? FileManager.default.removeItem(at: directory) }
    }

    private func resource(_ mode: String, fingerprint: String = "pinned-content") -> ModelTransferResource {
        ModelTransferResource(id: "fixture", url: baseURL.appendingPathComponent(mode).appending(queryItems: [.init(name: "case", value: "test")]),
                              bytes: size, fingerprint: fingerprint)
    }
    private var expected: Data { Data((0..<Int(size)).map { UInt8($0 % 256) }) }
    private func saved(_ item: ModelTransferResource) -> Int64 { ModelTransfer.savedBytes(for: item, in: directory) }
    private func interrupt(_ item: ModelTransferResource) async throws {
        do { _ = try await ModelTransfer(resource: item, directory: directory).run(); XCTFail("Truncated response must fail") }
        catch { }
        XCTAssertGreaterThan(saved(item), 0)
        XCTAssertLessThan(saved(item), size)
    }
    private func log(_ name: String = "test") async throws -> [[String: String]] {
        let url = baseURL.appendingPathComponent("requests").appending(queryItems: [.init(name: "case", value: name)])
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([[String: String]].self, from: data)
    }

    func testConnectionDropResumesExactRemainingBytesWithValidator() async throws {
        let item = resource("resume")
        try await interrupt(item)
        let offset = saved(item)
        let file = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), expected)
        let requests = try await log()
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[1]["range"], "bytes=\(offset)-")
        XCTAssertEqual(requests[1]["ifRange"], "\"v1\"")
    }

    func testServerIgnoringRangeRestartsWithoutDuplicatingFile() async throws {
        let item = resource("ignore-range")
        try await interrupt(item)
        let file = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), expected)
    }

    func testRedirectRetainsRangeAndValidatorOnResume() async throws {
        let item = resource("redirect")
        try await interrupt(item)
        let offset = saved(item)
        let file = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), expected)
        let requests = try await log("test-target")
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.last?["range"], "bytes=\(offset)-")
        XCTAssertEqual(requests.last?["ifRange"], "\"v1\"")
    }

    func testIfRangeReplacementDiscardsOldBytes() async throws {
        let item = resource("replace")
        try await interrupt(item)
        let file = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), Data(repeating: 66, count: Int(size)))
    }

    func testMismatchingRangeAndTotalCannotAppendToPartialFile() async throws {
        for mode in ["bad-range", "bad-total", "changed-206"] {
            let item = resource(mode)
            // Each mode gets an independent request sequence in this test.
            let isolated = ModelTransferResource(id: item.id,
                url: baseURL.appendingPathComponent(mode).appending(queryItems: [.init(name: "case", value: mode)]),
                bytes: size, fingerprint: item.fingerprint)
            try await interrupt(isolated)
            let offset = saved(isolated)
            do { _ = try await ModelTransfer(resource: isolated, directory: directory).run(); XCTFail("Invalid range accepted") }
            catch { XCTAssertTrue(error is ModelTransferError) }
            XCTAssertEqual(saved(isolated), offset)
            try ModelTransfer.discard(isolated, in: directory)
        }
    }

    func testPauseAndNewTransferInstanceResumeTheSameFile() async throws {
        let item = resource("slow")
        let download = Task { try await ModelTransfer(resource: item, directory: directory).run() }
        for _ in 0..<100 {
            if saved(item) >= 65_536 { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        download.cancel()
        do { _ = try await download.value; XCTFail("Pause did not cancel the active request") }
        catch { XCTAssertTrue(error is CancellationError) }
        let offset = saved(item)
        XCTAssertGreaterThan(offset, 0); XCTAssertLessThan(offset, size)
        let file = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), expected)
        let requests = try await log()
        XCTAssertEqual(requests.last?["range"], "bytes=\(offset)-")
    }

    func testCompletedPartialCanBeReverifiedWithoutAnotherNetworkRequest() async throws {
        let item = resource("complete")
        let first = try await ModelTransfer(resource: item, directory: directory).run()
        let second = try await ModelTransfer(resource: item, directory: directory).run()
        XCTAssertEqual(first, second); XCTAssertEqual(try Data(contentsOf: second), expected)
        let requests = try await log(); XCTAssertEqual(requests.count, 1)
    }

    func testChangedPinnedIdentityStartsAtZero() async throws {
        let old = resource("resume")
        try await interrupt(old)
        let new = resource("resume", fingerprint: "different-pinned-hash")
        XCTAssertEqual(saved(new), 0)
        let file = try await ModelTransfer(resource: new, directory: directory).run()
        XCTAssertEqual(try Data(contentsOf: file), expected)
        let requests = try await log(); XCTAssertEqual(requests.last?["range"], "")
    }

    func testHTTPFailureRetainsResumableBytes() async throws {
        let item = resource("unavailable")
        try await interrupt(item)
        let offset = saved(item)
        do { _ = try await ModelTransfer(resource: item, directory: directory).run(); XCTFail("HTTP 503 accepted") }
        catch { XCTAssertTrue(error is ModelTransferError) }
        XCTAssertEqual(saved(item), offset)
    }

    func testFullResponseHeadersWithoutABodyDoNotEraseSavedBytes() async throws {
        let item = resource("empty-restart")
        try await interrupt(item)
        let offset = saved(item)
        let file = directory.appendingPathComponent("fixture.partial")
        let before = try Data(contentsOf: file)
        do { _ = try await ModelTransfer(resource: item, directory: directory).run(); XCTFail("Empty replacement accepted") }
        catch { }
        XCTAssertEqual(saved(item), offset)
        XCTAssertEqual(try Data(contentsOf: file), before)
    }

    func testOversizedBodyCannotBeReturnedAsACompleteModel() async throws {
        let item = resource("oversize")
        do { _ = try await ModelTransfer(resource: item, directory: directory).run(); XCTFail("Oversized body accepted") }
        catch { XCTAssertTrue(error is ModelTransferError) }
        XCTAssertLessThanOrEqual(saved(item), size)
    }

    func testDiscardRemovesPartialAndCheckpoint() async throws {
        let item = resource("resume")
        try await interrupt(item)
        try ModelTransfer.discard(item, in: directory)
        XCTAssertEqual(saved(item), 0)
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("fixture.partial").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("fixture.resume.json").path))
    }
}
