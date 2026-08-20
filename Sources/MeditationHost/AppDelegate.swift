import AppKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var hostWindow: NSWindow!
    private var participantWindow: ParticipantWindowController!
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private var keyMonitor: Any?
    private var mouseMonitor: Any?
    private var localMouseMonitor: Any?
    private let apiServer=APIServer()

    func applicationDidFinishLaunching(_ notification: Notification) {
        installAppIcon()
        installMenusAndHotkeys()
        installBuiltInChime()
        apiServer.start()
        participantWindow = ParticipantWindowController()
        participantWindow.showWindow(nil)

        let host = HostViewController()
        hostWindow = NSWindow(contentViewController: host)
        hostWindow.title = "靜心主持台"
        hostWindow.styleMask = [.titled, .closable, .miniaturizable]
        hostWindow.setContentSize(NSSize(width: 370, height: 760))
        hostWindow.minSize = NSSize(width: 350, height: 700)
        hostWindow.maxSize = NSSize(width: 410, height: 860)
        hostWindow.isReleasedWhenClosed = false
        applyInitialLayout()
        ensureParticipantVisible()
        hostWindow.makeKeyAndOrderFront(nil)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menuIcon = Bundle.main.url(forResource:"MenuBarIcon",withExtension:"png").flatMap(NSImage.init(contentsOf:)) ?? NSImage(systemSymbolName:"circle.circle",accessibilityDescription:"靜心主持台")
        menuIcon?.isTemplate=true; menuIcon?.size=NSSize(width:18,height:18); statusItem.button?.image=menuIcon
        statusItem.button?.target = self; statusItem.button?.action = #selector(togglePopover)
        popover.contentSize = NSSize(width: 390, height: 760)
        popover.behavior = .applicationDefined
        let menuBarHost=HostViewController(); menuBarHost.isMenuBarController=true; popover.contentViewController = menuBarHost
        mouseMonitor=NSEvent.addGlobalMonitorForEvents(matching:.mouseMoved){[weak self] _ in self?.raiseParticipantAtMenuBar() }
        localMouseMonitor=NSEvent.addLocalMonitorForEvents(matching:.mouseMoved){[weak self] event in self?.raiseParticipantAtMenuBar(); return event }
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) { apiServer.stop(); if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }; if let mouseMonitor { NSEvent.removeMonitor(mouseMonitor) }; if let localMouseMonitor { NSEvent.removeMonitor(localMouseMonitor) } }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationDidBecomeActive(_ notification: Notification) { ensureParticipantVisible() }

    func hideHostWindow() { hostWindow.orderOut(nil); ensureParticipantVisible(); showPopover() }
    @objc func showHostWindow() { popover.performClose(nil); ensureParticipantVisible(); hostWindow.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc private func togglePopover() {
        guard statusItem.button != nil else { return }
        if popover.isShown { popover.performClose(nil) } else { hostWindow.orderOut(nil); ensureParticipantVisible(); showPopover() }
    }
    private func showPopover(){ guard let button=statusItem.button else{return}; popover.show(relativeTo:button.bounds,of:button,preferredEdge:.minY); NSApp.activate(ignoringOtherApps:true) }
    func ensureParticipantVisible() {
        guard let window=participantWindow?.window else{return}
        if !window.isVisible { participantWindow.showWindow(nil) }
        if AppModel.shared.alwaysOnTop { window.level = .floating }
        window.orderFront(nil)
    }
    private func raiseParticipantAtMenuBar(){ let point=NSEvent.mouseLocation; guard let screen=NSScreen.screens.first(where:{$0.frame.contains(point)}) else{return}; if point.y >= screen.frame.maxY-28 { participantWindow.window?.orderFrontRegardless() } }
    private func applyInitialLayout() {
        guard let screen=NSScreen.main, let participant=participantWindow.window else { hostWindow.center(); return }
        let area=screen.visibleFrame, gap:CGFloat=18, margin:CGFloat=20, hostWidth:CGFloat=370
        hostWindow.setFrameOrigin(NSPoint(x:area.maxX-hostWidth-margin,y:area.maxY-hostWindow.frame.height-margin))
        let availableWidth=max(640,hostWindow.frame.minX-gap-area.minX-margin)
        let maxHeight=area.height-margin*2
        var width=min(availableWidth,maxHeight*16/9); var height=width*9/16
        if height>maxHeight { height=maxHeight; width=height*16/9 }
        participant.setFrame(NSRect(x:area.minX+margin,y:area.midY-height/2,width:width,height:height),display:true)
    }

    @objc func showHotkeyHelp() {
        let alert=NSAlert(); alert.messageText="靜心主持台熱鍵"
        alert.informativeText="⌘Z　還原物件上一步位置\n⇧⌘Z　回到物件下一步位置\nReturn　開始／繼續\n空白鍵　暫停／繼續\nEsc　提早結束\n⌘R　重新準備\n⇧⌘D　顯示／隱藏倒數\n⇧⌘T　切換最上層\n⌃⌘F　參與者全螢幕\n⌘,　完整設定\n⌘0　顯示設定視窗\n⌘H　隱藏 App\n⌘Q　結束 App"
        alert.addButton(withTitle:"完成"); alert.runModal()
    }


    private func installAppIcon() {
        if let url = Bundle.main.url(forResource: "MeditationIconTransparentV5", withExtension: "icns"), let image = NSImage(contentsOf: url) {
            NSApp.applicationIconImage = image
            DispatchQueue.main.async { NSApp.applicationIconImage = image }
        }
    }
    private func installBuiltInChime() { if let url=Bundle.main.url(forResource:"BuiltInChime",withExtension:"m4a") { AppModel.shared.openingSoundURL=url; AppModel.shared.closingSoundURL=url } }

    private func installMenusAndHotkeys() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(title: "靜心主持台")
        appMenu.addItem(withTitle: "關於靜心主持台", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        let settings = appMenu.addItem(withTitle: "顯示完整設定…", action: #selector(showHostWindow), keyEquivalent: ","); settings.target = self
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隱藏靜心主持台", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "隱藏其他項目", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command,.option]
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "結束靜心主持台", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem=NSMenuItem(); main.addItem(editItem)
        let edit=NSMenu(title:"編輯")
        let undo=edit.addItem(withTitle:"還原物件位置", action:#selector(undoObjectPosition), keyEquivalent:"z"); undo.target=self
        let redo=edit.addItem(withTitle:"重做物件位置", action:#selector(redoObjectPosition), keyEquivalent:"z"); redo.keyEquivalentModifierMask=[.command,.shift]; redo.target=self
        edit.addItem(NSMenuItem.separator())
        edit.addItem(withTitle:"剪下", action:#selector(NSText.cut(_:)), keyEquivalent:"x")
        edit.addItem(withTitle:"複製", action:#selector(NSText.copy(_:)), keyEquivalent:"c")
        edit.addItem(withTitle:"貼上", action:#selector(NSText.paste(_:)), keyEquivalent:"v")
        edit.addItem(withTitle:"全選", action:#selector(NSText.selectAll(_:)), keyEquivalent:"a")
        editItem.submenu=edit

        let windowItem=NSMenuItem(); main.addItem(windowItem)
        let windowMenu=NSMenu(title:"視窗")
        windowMenu.addItem(withTitle:"最小化", action:#selector(NSWindow.performMiniaturize(_:)), keyEquivalent:"m")
        windowMenu.addItem(withTitle:"關閉視窗", action:#selector(NSWindow.performClose(_:)), keyEquivalent:"w")
        windowMenu.addItem(NSMenuItem.separator())
        let show=windowMenu.addItem(withTitle:"顯示完整設定", action:#selector(showHostWindow), keyEquivalent:"0"); show.target=self
        windowItem.submenu=windowMenu

        let sessionItem = NSMenuItem(); main.addItem(sessionItem)
        let session = NSMenu(title: "控制")
        addMenuItem(session, "開始／繼續", "return", [], #selector(startSession))
        addMenuItem(session, "暫停／繼續", " ", [], #selector(togglePause))
        addMenuItem(session, "重新準備", "r", [.command], #selector(resetSession))
        addMenuItem(session, "提早結束", "\u{1b}", [], #selector(finishSession))
        session.addItem(NSMenuItem.separator())
        addMenuItem(session, "參與者顯示倒數", "d", [.command,.shift], #selector(toggleCountdown))
        addMenuItem(session, "參與者視窗保持最上層", "t", [.command,.shift], #selector(toggleAlwaysOnTop))
        addMenuItem(session, "參與者視窗全螢幕", "f", [.command,.control], #selector(toggleParticipantFullScreen))
        sessionItem.submenu = session
        let helpItem=NSMenuItem(); main.addItem(helpItem); let help=NSMenu(title:"輔助說明"); let shortcuts=help.addItem(withTitle:"熱鍵說明",action:#selector(showHotkeyHelp),keyEquivalent:"/"); shortcuts.keyEquivalentModifierMask=[.command]; shortcuts.target=self; helpItem.submenu=help
        NSApp.mainMenu = main

        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            if event.modifierFlags.intersection(.deviceIndependentFlagsMask).isEmpty,
               !(NSApp.keyWindow?.firstResponder is NSTextView) {
                if event.keyCode == 49 { self.togglePause(); return nil }
                if event.keyCode == 53 { self.finishSession(); return nil }
            }
            return event
        }
    }

    private func addMenuItem(_ menu:NSMenu, _ title:String, _ key:String, _ modifiers:NSEvent.ModifierFlags, _ action:Selector) {
        let item=menu.addItem(withTitle:title, action:action, keyEquivalent:key); item.keyEquivalentModifierMask=modifiers; item.target=self
    }

    @objc private func startSession() { AppModel.shared.startOrResume() }
    @objc private func togglePause() { AppModel.shared.state == .running ? AppModel.shared.pause() : AppModel.shared.startOrResume() }
    @objc private func resetSession() { AppModel.shared.reset() }
    @objc private func finishSession() { AppModel.shared.finishEarly() }
    @objc private func toggleCountdown() { AppModel.shared.showCountdown.toggle() }
    @objc private func toggleAlwaysOnTop() { AppModel.shared.alwaysOnTop.toggle() }
    @objc private func toggleParticipantFullScreen() { participantWindow.window?.toggleFullScreen(nil) }
    @objc private func undoObjectPosition() { AppModel.shared.undoPositionChange() }
    @objc private func redoObjectPosition() { AppModel.shared.redoPositionChange() }
}
