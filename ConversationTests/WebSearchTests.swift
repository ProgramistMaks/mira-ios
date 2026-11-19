import XCTest
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
#if canImport(MiraConversationCore)
@testable import MiraConversationCore
#else
@testable import Companion
#endif

final class WebSearchTests: XCTestCase {
    func testSendsRealQueryAndKeepsOnlyUniqueSafeSources() async throws {
        let client = WebSearch { request in
            XCTAssertEqual(request.url?.absoluteString, "https://api.tavily.com/search")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-key")
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
            XCTAssertEqual(body["query"] as? String, "погода в Москве")
            XCTAssertEqual(body["include_answer"] as? Bool, false)
            let data = Data(#"{"results":[{"title":"Source","url":"https://example.com/a","content":"Actual excerpt"},{"title":"Duplicate","url":"https://example.com/a","content":"dup"},{"title":"Unsafe","url":"javascript:alert(1)","content":"bad"},{"title":"Credentials","url":"https://name:password@example.com/","content":"bad"}]}"#.utf8)
            return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let hits = try await client.search("  погода в Москве  ", key: "test-key")
        XCTAssertEqual(hits.count, 1)
        XCTAssertEqual(hits.first?.content, "Actual excerpt")
    }
    func testSearchAuthenticationAndQuotaHaveActionableErrors() async throws {
        for code in [401, 403, 429, 432, 433] {
            let client = WebSearch { request in
                (Data(), HTTPURLResponse(url: request.url!, statusCode: code, httpVersion: nil, headerFields: nil)!)
            }
            do { _ = try await client.search("Запрос", key: "bad-key"); XCTFail("HTTP failure must not become an answer") }
            catch let error as WebSearch.SearchError {
                if code == 401 || code == 403 {
                    if case .authorization = error {} else { XCTFail("Expected search key error") }
                } else {
                    if case .quota = error {} else { XCTFail("Expected search quota error") }
                }
            }
        }
    }
    func testMissingSetupAndEmptyQueriesDoNotMakeNetworkRequests() async {
        let client = WebSearch { _ in XCTFail("No request expected"); throw URLError(.badURL) }
        for (query, key) in [("Запрос", ""), ("  ", "key"), (String(repeating: "а", count: 401), "key")] {
            do { _ = try await client.search(query, key: key); XCTFail("Invalid setup accepted") }
            catch { XCTAssertTrue(error is WebSearch.SearchError) }
        }
    }
    func testSourcesPersistAndOldMessagesStillDecode() throws {
        let old = Data(#"{"id":"2A4DCA93-1C95-4FF1-A199-5B62AA937CBA","role":"assistant","content":"Привет","interrupted":false}"#.utf8)
        var message = try JSONDecoder().decode(Message.self, from: old)
        XCTAssertNil(message.sources)
        message.sources = [SearchSource(title: "Source", url: "https://example.com")]
        XCTAssertEqual(try JSONDecoder().decode(Message.self, from: JSONEncoder().encode(message)), message)
    }
}
