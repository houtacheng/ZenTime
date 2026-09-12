import Foundation
import Network
import AppKit

final class APIServer {
    static let port: UInt16 = 4747
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "MeditationHost.API")

    func start() {
        guard listener == nil, let port = NWEndpoint.Port(rawValue: Self.port) else { return }
        do {
            let listener = try NWListener(using: .tcp, on: port)
            listener.newConnectionHandler = { [weak self] in self?.accept($0) }
            listener.stateUpdateHandler = { state in
                if case .failed(let error) = state { NSLog("Meditation API failed: \(error)") }
            }
            listener.start(queue: queue)
            self.listener = listener
        } catch { NSLog("Meditation API could not start: \(error)") }
    }

    func stop() { listener?.cancel(); listener = nil }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else { connection.cancel(); return }
            let first = request.components(separatedBy: "\r\n").first ?? ""
            let parts = first.split(separator: " ")
            let rawPath = parts.count > 1 ? String(parts[1]) : "/"
            self.route(rawPath) { status, body in self.respond(connection, status: status, body: body) }
        }
    }

    private func route(_ rawPath: String, completion: @escaping (Int, String) -> Void) {
        guard let components = URLComponents(string: "http://localhost\(rawPath)") else { completion(400, json(["error":"bad request"])); return }
        let path = components.path
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        DispatchQueue.main.async {
            let model = AppModel.shared
            if path == "/" || path == "/remote" {
                if let url=Bundle.main.url(forResource:"RemoteControl",withExtension:"html"), let body=try? String(contentsOf:url,encoding:.utf8) { completion(200,body); return }
                completion(404,"Remote control page missing"); return
            }
            switch path {
            case "/api/state": break
            case "/api/start": model.startOrResume()
            case "/api/pause": model.pause()
            case "/api/toggle": model.state == .running ? model.pause() : model.startOrResume()
            case "/api/reset": model.reset()
            case "/api/finish": model.finishEarly()
            case "/api/toggle-participant": (NSApp.delegate as? AppDelegate)?.toggleParticipantVisibility()
            case "/api/duration":
                guard let value=query["minutes"], let minutes=Int(value), (1...999).contains(minutes), model.state != .running else { completion(400,self.json(["error":"minutes must be 1...999 and session must not be running"])); return }
                model.selectedMinutes=minutes
            default: completion(404,self.json(["error":"not found"])); return
            }
            completion(200,self.stateJSON())
        }
    }

    private func stateJSON() -> String {
        let model=AppModel.shared
        let state:String
        switch model.state { case .ready:state="ready"; case .running:state="running"; case .paused:state="paused"; case .finished:state="finished" }
        return json(["state":state,"remaining":model.remainingSeconds,"remainingText":model.formattedRemaining,"selectedMinutes":model.selectedMinutes,"showCountdown":model.showCountdown,"participantVisible":(NSApp.delegate as? AppDelegate)?.participantIsVisible ?? true])
    }

    private func json(_ object:[String:Any])->String { let data=try? JSONSerialization.data(withJSONObject:object,options:[]); return String(data:data ?? Data("{}".utf8),encoding:.utf8) ?? "{}" }
    private func respond(_ connection:NWConnection,status:Int,body:String) {
        let reason=status==200 ? "OK" : status==404 ? "Not Found" : "Bad Request"
        let data=Data(body.utf8)
        let contentType=body.hasPrefix("<!doctype") ? "text/html; charset=utf-8" : "application/json; charset=utf-8"
        let header="HTTP/1.1 \(status) \(reason)\r\nContent-Type: \(contentType)\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: \(data.count)\r\nConnection: close\r\n\r\n"
        connection.send(content:Data(header.utf8)+data,completion:.contentProcessed{_ in connection.cancel()})
    }
}
