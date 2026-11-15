import Foundation

struct SearchHit: Decodable, Identifiable {
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
    enum SearchError: LocalizedError {
        case missingKey, queryLength
        var errorDescription: String? {
            switch self {
            case .missingKey: return "Добавь ключ Tavily в настройках поиска."
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
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CompanionError.invalidResponse }
        if http.statusCode == 401 || http.statusCode == 403 { throw CompanionError.authorization }
        guard http.statusCode == 200 else { throw CompanionError.server(http.statusCode) }
        guard data.count <= 2_000_000 else { throw CompanionError.invalidResponse }
        let hits = try JSONDecoder().decode(Response.self, from: data).results
        var seen = Set<String>()
        return hits.filter { $0.safeURL != nil && seen.insert($0.url).inserted }
    }
}
