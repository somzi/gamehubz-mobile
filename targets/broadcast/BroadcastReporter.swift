import Foundation

/// Tells the GameHubz backend what the broadcast is doing, authenticated with the session token only
/// (the extension has no login). Best effort: the backend's own sweep covers an extension that can't
/// reach it.
final class BroadcastReporter: @unchecked Sendable {
  private let baseUrl: String
  private let sessionToken: String
  private let session: URLSession

  init(apiBaseUrl: String, sessionToken: String) {
    var base = apiBaseUrl
    while base.hasSuffix("/") { base.removeLast() }
    self.baseUrl = base
    self.sessionToken = sessionToken

    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 10
    self.session = URLSession(configuration: configuration)
  }

  /// A few tries with a growing pause; the first heartbeat also puts the stream on air if every one
  /// of them is lost.
  func started(attempt: Int = 1) {
    post("started") { [weak self] data in
      guard data == nil, attempt < 3, let self else { return }
      DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(2 * attempt)) {
        self.started(attempt: attempt + 1)
      }
    }
  }

  /// completion(true) when the backend says the stream must stop.
  func heartbeat(completion: @escaping @Sendable (Bool) -> Void) {
    post("heartbeat") { data in
      guard let data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
      completion((json["stop"] as? Bool) ?? false)
    }
  }

  func stopped() {
    post("stopped") { _ in }
  }

  private func post(_ path: String, completion: @escaping @Sendable (Data?) -> Void) {
    guard let url = URL(string: baseUrl + "/" + path) else { return }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(sessionToken, forHTTPHeaderField: "X-Broadcast-Token")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.httpBody = Data("{}".utf8)

    session.dataTask(with: request) { data, response, _ in
      let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
      completion(ok ? data : nil)
    }.resume()
  }
}
