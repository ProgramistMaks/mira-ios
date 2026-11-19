import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

struct SearchHit: Decodable, Identifiable, Sendable {
    let title: String
    let url: String
    let content: String
    var id: String { url }
    var safeURL: URL? {
        guard let value = URL(string: url), value.scheme == "https", value.host != nil,
              value.user == nil, value.password == nil else { return nil }
        return value
    }
}

struct WebSearch {
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    private let transport: Transport?
    init(transport: Transport? = nil) { self.transport = transport }
    enum SearchError: LocalizedError {
        case missingKey, queryLength, authorization, quota
        var errorDescription: String? {
            switch self {
            case .missingKey: return "Добавь ключ Tavily в настройках поиска."
            case .authorization: return "Ключ поиска не принят Tavily. Проверь его в настройках поиска."
            case .quota: return "Лимит запросов Tavily исчерпан или временно превышен. Проверь тариф поиска."
            case .queryLength: return "Для поиска нужен запрос длиной от 1 до 400 символов."
            }
        }
    }
    private struct Query: Encodable {
        let query: String
        let search_depth = "basic"
        let max_results = 5
        let include_answer = false
        let include_raw_content = false
    }
    private struct Response: Decodable { let results: [SearchHit] }
    func search(_ query: String, key: String) async throws -> [SearchHit] {
        let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty && value.count <= 400 else { throw SearchError.queryLength }
        guard !key.isEmpty else { throw SearchError.missingKey }
        var request = URLRequest(url: URL(string: "https://api.tavily.com/search")!)
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Query(query: value))
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let data: Data, response: URLResponse
        if let transport { (data, response) = try await transport(request) }
        else { (data, response) = try await session.data(for: request) }
        guard let http = response as? HTTPURLResponse else { throw CompanionError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw SearchError.authorization }
        if [429, 432, 433].contains(http.statusCode) { throw SearchError.quota }
        guard http.statusCode == 200 else { throw CompanionError.server(http.statusCode) }
        guard data.count <= 2_000_000 else { throw CompanionError.invalidResponse }
        let hits = try JSONDecoder().decode(Response.self, from: data).results
        var seen = Set<String>()
        return hits.filter { $0.safeURL != nil && seen.insert($0.url).inserted }
    }
}
