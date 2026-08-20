import AppKit

final class ParticipantWindowController: NSWindowController {
    init() {
        let contentSize = NSSize(width: 960, height: 540)
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: contentSize),
            styleMask: [.borderless, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "靜心顯示畫面"
        window.contentAspectRatio = NSSize(width: 16, height: 9)
        window.minSize = NSSize(width: 640, height: 360)
        window.backgroundColor = .black
        window.isMovableByWindowBackground = false
        window.hidesOnDeactivate = false
        window.isExcludedFromWindowsMenu = false
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenAuxiliary]
        window.contentView = ParticipantView(frame: NSRect(origin: .zero, size: contentSize))
        super.init(window: window)
        AppModel.shared.onWindowSettingChange = { [weak window] in
            window?.level = AppModel.shared.alwaysOnTop ? .floating : .normal
        }
    }

    required init?(coder: NSCoder) { fatalError() }
}
