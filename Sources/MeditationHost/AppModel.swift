import AppKit
import AVFoundation

enum SessionState {
    case ready, running, paused, finished
}
enum CountdownProgressStyle { case ring, line }

final class AppModel: NSObject {
    static let shared = AppModel()

    var onVisualChange: (() -> Void)?
    var onTimerChange: (() -> Void)?
    var onStateChange: (() -> Void)?
    var onWindowSettingChange: (() -> Void)?

    var displayText = "靜心練習" { didSet { onVisualChange?() } }
    var textColor = NSColor(calibratedWhite: 0.97, alpha: 1) { didSet { onVisualChange?() } }
    var fontName = "PingFangTC-Semibold" { didSet { onVisualChange?() } }
    var fontSize: CGFloat = 80 { didSet { onVisualChange?() } }
    var textBoxWidth: CGFloat = 0.72 { didSet { onVisualChange?() } }
    var backgroundColor = NSColor.black { didSet { backgroundImage = nil; onVisualChange?() } }
    var backgroundGradientEnabled = false { didSet { backgroundImage=nil; onVisualChange?() } }
    var backgroundGradientStart = NSColor.black { didSet { onVisualChange?() } }
    var backgroundGradientEnd = NSColor(calibratedRed:0.08,green:0.18,blue:0.14,alpha:1) { didSet { onVisualChange?() } }
    var backgroundImage: NSImage? { didSet { onVisualChange?() } }
    var showCurrentTime = false { didSet { onVisualChange?() } }
    var currentTimeUses24Hour = false { didSet { onVisualChange?() } }
    var currentTimeFontSize: CGFloat = 50 { didSet { onVisualChange?() } }
    var currentTimePosition = CGPoint(x: 0.5, y: 0.86) { didSet { onVisualChange?() } }
    var textPosition = CGPoint(x: 0.5, y: 0.62) { didSet { onVisualChange?() } }
    var showCountdown = false { didSet { onVisualChange?() } }
    var countdownFontSize: CGFloat = 60 { didSet { onVisualChange?() } }
    var countdownFontName = "STHeitiTC-Medium" { didSet { onVisualChange?() } }
    var countdownPosition = CGPoint(x: 0.5, y: 0.25) { didSet { onVisualChange?() } }
    var countdownProgressStyle: CountdownProgressStyle = .ring { didSet { onVisualChange?() } }
    var countdownProgressSize: CGFloat = 0.25 { didSet { onVisualChange?() } }
    var progressColorStart = NSColor.systemGreen { didSet { onVisualChange?() } }
    var progressColorEnd = NSColor.systemYellow { didSet { onVisualChange?() } }
    var alwaysOnTop = false { didSet { onWindowSettingChange?() } }

    var openingSoundURL: URL?
    var musicURL: URL?
    var closingSoundURL: URL?
    var musicEnabled = false
    var silentMode = false
    var openingVolume: Float = 0.3
    var musicVolume: Float = 0.3
    var closingVolume: Float = 0.3
    var openingFadeIn = true
    var openingFadeOut = true
    var musicFadeIn = true
    var musicFadeOut = true
    var closingFadeIn = true
    var closingFadeOut = true
    var selectedMinutes = 10 {
        didSet {
            guard state == .ready || state == .finished else { return }
            remainingSeconds = selectedMinutes * 60
            onTimerChange?()
            onVisualChange?()
        }
    }
    private(set) var remainingSeconds = 600
    private(set) var state: SessionState = .ready

    private var timer: Timer?
    private var openingPlayer: AVAudioPlayer?
    private var musicPlayer: AVAudioPlayer?
    private var closingPlayer: AVAudioPlayer?
    private var activity: NSObjectProtocol?
    private struct PositionSnapshot {
        let clock: CGPoint
        let text: CGPoint
        let countdown: CGPoint
    }
    private var positionUndoStack: [PositionSnapshot] = []
    private var positionRedoStack: [PositionSnapshot] = []
    private var dragStartSnapshot: PositionSnapshot?

    var formattedRemaining: String {
        String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }
    var countdownProgress: CGFloat { selectedMinutes > 0 ? 1 - CGFloat(remainingSeconds) / CGFloat(selectedMinutes * 60) : 0 }

    func beginPositionChange() { dragStartSnapshot = currentPositionSnapshot() }

    func commitPositionChange() {
        guard let start = dragStartSnapshot else { return }
        dragStartSnapshot = nil
        let current = currentPositionSnapshot()
        guard !samePositions(start, current) else { return }
        positionUndoStack.append(start)
        positionRedoStack.removeAll()
    }

    func undoPositionChange() {
        guard let previous = positionUndoStack.popLast() else { return }
        positionRedoStack.append(currentPositionSnapshot())
        applyPositionSnapshot(previous)
    }

    func redoPositionChange() {
        guard let next = positionRedoStack.popLast() else { return }
        positionUndoStack.append(currentPositionSnapshot())
        applyPositionSnapshot(next)
    }

    private func currentPositionSnapshot() -> PositionSnapshot { PositionSnapshot(clock:currentTimePosition,text:textPosition,countdown:countdownPosition) }
    private func samePositions(_ a:PositionSnapshot,_ b:PositionSnapshot)->Bool { a.clock==b.clock && a.text==b.text && a.countdown==b.countdown }
    private func applyPositionSnapshot(_ snapshot:PositionSnapshot) { currentTimePosition=snapshot.clock; textPosition=snapshot.text; countdownPosition=snapshot.countdown }

    func startOrResume() {
        switch state {
        case .ready, .finished:
            remainingSeconds = selectedMinutes * 60
            state = .running
            preventSleep()
            startTimer()
            playOpeningThenBegin()
        case .paused:
            state = .running
            musicPlayer?.play()
            startTimer()
        case .running:
            return
        }
        onStateChange?()
        onTimerChange?()
    }

    func pause() {
        guard state == .running else { return }
        timer?.invalidate()
        timer = nil
        openingPlayer?.pause()
        musicPlayer?.pause()
        state = .paused
        onStateChange?()
    }

    func reset() {
        stopAllAudio()
        timer?.invalidate()
        timer = nil
        remainingSeconds = selectedMinutes * 60
        state = .ready
        allowSleep()
        onTimerChange?()
        onStateChange?()
    }

    func finishEarly() {
        guard state == .running || state == .paused else { return }
        completeSession()
    }

    private func playOpeningThenBegin() {
        if silentMode { beginMeditation(); return }
        if let url = openingSoundURL, let player = try? AVAudioPlayer(contentsOf: url) {
            openingPlayer = player
            player.delegate = self
            player.prepareToPlay()
            player.volume = openingFadeIn ? 0 : openingVolume
            player.play()
            if openingFadeIn { player.setVolume(openingVolume, fadeDuration: 2) }
            if openingFadeOut {
                let fadeStart = max(player.duration - 2, 0)
                DispatchQueue.main.asyncAfter(deadline: .now() + fadeStart) { [weak player] in player?.setVolume(0, fadeDuration: 2) }
            }
        } else {
            beginMeditation()
        }
    }

    private func beginMeditation() {
        guard state == .running else { return }
        if !silentMode, musicEnabled, let url = musicURL, let player = try? AVAudioPlayer(contentsOf: url) {
            musicPlayer = player
            player.numberOfLoops = -1
            player.volume = musicFadeIn ? 0 : musicVolume
            player.prepareToPlay()
            player.play()
            if musicFadeIn { player.setVolume(musicVolume, fadeDuration: 2) }
        }
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self, self.state == .running else { return }
            if self.remainingSeconds > 0 {
                self.remainingSeconds -= 1
                if self.remainingSeconds == 5, self.musicFadeOut { self.musicPlayer?.setVolume(0, fadeDuration: 5) }
                self.onTimerChange?()
                self.onVisualChange?()
            } else {
                self.completeSession()
            }
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func completeSession() {
        timer?.invalidate()
        timer = nil
        if silentMode { musicPlayer?.stop(); state = .finished; allowSleep(); onStateChange?(); return }
        let delay = musicFadeOut ? 1.5 : 0
        if musicFadeOut { musicPlayer?.setVolume(0, fadeDuration: delay) } else { musicPlayer?.stop() }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            self.musicPlayer?.stop()
            if let url = self.closingSoundURL, let player = try? AVAudioPlayer(contentsOf: url) {
                self.closingPlayer = player
                player.volume = self.closingFadeIn ? 0 : self.closingVolume
                player.prepareToPlay()
                player.play()
                if self.closingFadeIn { player.setVolume(self.closingVolume, fadeDuration: 2) }
                if self.closingFadeOut {
                    let fadeStart = max(player.duration - 2, 0)
                    DispatchQueue.main.asyncAfter(deadline: .now() + fadeStart) { [weak player] in player?.setVolume(0, fadeDuration: 2) }
                }
            }
        }
        state = .finished
        allowSleep()
        onStateChange?()
    }

    private func stopAllAudio() {
        openingPlayer?.stop(); musicPlayer?.stop(); closingPlayer?.stop()
        openingPlayer = nil; musicPlayer = nil; closingPlayer = nil
    }

    private func preventSleep() {
        guard activity == nil else { return }
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleSystemSleepDisabled], reason: "靜心活動進行中")
    }

    private func allowSleep() {
        if let activity { ProcessInfo.processInfo.endActivity(activity) }
        activity = nil
    }
}

extension AppModel: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if player === openingPlayer { beginMeditation() }
    }
}
