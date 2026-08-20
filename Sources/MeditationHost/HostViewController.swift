import AppKit
import UniformTypeIdentifiers

final class HostViewController: NSViewController {
    var isMenuBarController = false
    private let model = AppModel.shared
    private let timerLabel = NSTextField(labelWithString: "10:00")
    private let clockLabel = NSTextField(labelWithString: "")
    private let statusLabel = NSTextField(labelWithString: "準備完成，尚未開始")
    private let startButton = NSButton(title: "開始", target: nil, action: nil)
    private let pauseButton = NSButton(title: "暫停", target: nil, action: nil)
    private let musicCheck = NSButton(checkboxWithTitle: "使用背景音樂", target: nil, action: nil)
    private let silentCheck = NSButton(checkboxWithTitle: "無聲模式（略過所有聲音）", target: nil, action: nil)
    private let countdownCheck = NSButton(checkboxWithTitle: "參與者畫面顯示倒數", target: nil, action: nil)
    private let alwaysOnTopCheck = NSButton(checkboxWithTitle: "參與者視窗永遠顯示在最上層", target: nil, action: nil)
    private var durationButtons: [NSButton] = []
    private var volumeLabels: [ObjectIdentifier: NSTextField] = [:]
    private var fontNamesByDisplay: [String:String] = [:]
    private var clockTimer: Timer?

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 370, height: 760))
        buildUI()
        bindModel()
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        updateClock()
        clockTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.updateClock() }
    }

    private func buildUI() {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true; scroll.drawsBackground = false; scroll.translatesAutoresizingMaskIntoConstraints = false
        let document = FlippedView(); document.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = document; view.addSubview(scroll)
        NSLayoutConstraint.activate([scroll.leadingAnchor.constraint(equalTo:view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo:view.trailingAnchor), scroll.topAnchor.constraint(equalTo:view.topAnchor), scroll.bottomAnchor.constraint(equalTo:view.bottomAnchor), document.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor)])
        let root = NSStackView()
        root.orientation = .vertical
        root.spacing = 10
        root.edgeInsets = NSEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
        root.translatesAutoresizingMaskIntoConstraints = false
        document.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: document.leadingAnchor), root.trailingAnchor.constraint(equalTo: document.trailingAnchor),
            root.topAnchor.constraint(equalTo: document.topAnchor), root.bottomAnchor.constraint(equalTo: document.bottomAnchor)
        ])

        root.addArrangedSubview(header("靜心主持台"))
        root.addArrangedSubview(sectionLabel("時間與現場控制"))
        clockLabel.alignment = .center; clockLabel.textColor = .secondaryLabelColor
        timerLabel.alignment = .center; timerLabel.font = .monospacedDigitSystemFont(ofSize: 46, weight: .medium)
        statusLabel.alignment = .center; statusLabel.textColor = .secondaryLabelColor
        root.addArrangedSubview(clockLabel); root.addArrangedSubview(timerLabel); root.addArrangedSubview(statusLabel)
        let durations = NSGridView(); let values = [3, 5, 7, 10, 15, 20]
        for row in 0..<2 { durations.addRow(with:(0..<3).map { column in let minutes=values[row*3+column]; let b=button("\(minutes) 分鐘",#selector(durationSelected(_:))); b.tag=minutes; b.setButtonType(.pushOnPushOff); b.state=minutes==10 ? .on:.off; durationButtons.append(b); return b }) }
        durations.rowSpacing=7; durations.columnSpacing=7
        for index in 0..<3 { durations.column(at:index).width=100 }
        let customLabel=NSTextField(labelWithString:"自訂"); customLabel.alignment = .right
        let customMinutes=NSTextField(string:""); customMinutes.placeholderString="分鐘"; customMinutes.alignment = .center; customMinutes.target=self; customMinutes.action=#selector(customDurationChanged(_:)); customMinutes.formatter=NumberFormatter()
        let minutesLabel=NSTextField(labelWithString:"分鐘"); durations.addRow(with:[customLabel,customMinutes,minutesLabel]); root.addArrangedSubview(durations)
        let controls = NSStackView(); controls.orientation = .horizontal; controls.spacing = 8; controls.distribution = .fillEqually
        startButton.target = self; startButton.action = #selector(startPressed); startButton.bezelColor = .systemGreen
        pauseButton.target=self; pauseButton.action=#selector(pausePressed); controls.addArrangedSubview(startButton); controls.addArrangedSubview(pauseButton); root.addArrangedSubview(controls)
        let secondary=NSStackView(); secondary.orientation = .horizontal; secondary.spacing=8; secondary.distribution = .fillEqually
        secondary.addArrangedSubview(button("重新準備",#selector(resetPressed))); secondary.addArrangedSubview(button("提早結束",#selector(finishPressed))); root.addArrangedSubview(secondary)
        let remote=NSStackView(); remote.orientation = .horizontal; remote.spacing=8; remote.alignment = .top
        let remoteAddress=NSTextField(wrappingLabelWithString: Self.remoteControlAddresses()); remoteAddress.textColor = .secondaryLabelColor; remoteAddress.setContentHuggingPriority(.defaultLow,for:.horizontal)
        remote.addArrangedSubview(remoteAddress); remote.addArrangedSubview(button("開啟",#selector(openRemoteControl))); root.addArrangedSubview(remote)
        let topSeparator=NSBox(); topSeparator.boxType = .separator; root.addArrangedSubview(topSeparator)
        root.addArrangedSubview(sectionLabel("參與者畫面的現在時間"))
        let showClock = NSButton(checkboxWithTitle:"顯示現在時間",target:self,action:#selector(showCurrentTimeChanged(_:))); showClock.state = model.showCurrentTime ? .on:.off; root.addArrangedSubview(showClock)
        let clockFormat = NSPopUpButton(); clockFormat.addItems(withTitles:["24 小時制（18:30:00）","12 小時制（下午 6:30:00）"]); clockFormat.selectItem(at:model.currentTimeUses24Hour ? 0:1); clockFormat.target=self; clockFormat.action=#selector(currentTimeFormatChanged(_:)); root.addArrangedSubview(clockFormat)
        root.addArrangedSubview(sliderRow("現在時間大小", value: 50, min: 14, max: 120, action: #selector(currentTimeSizeChanged(_:)), suffix:" pt"))
        root.addArrangedSubview(sectionLabel("顯示文字"))
        let textInput = NSTextField(string: model.displayText)
        textInput.target = self; textInput.action = #selector(textChanged(_:))
        textInput.placeholderString = "輸入參與者要看到的文字"
        root.addArrangedSubview(textInput)

        let typography = NSStackView(); typography.orientation = .horizontal; typography.spacing = 8; typography.distribution = .fillEqually
        let fontCombo=NSPopUpButton()
        for name in NSFontManager.shared.availableFonts { if let font=NSFont(name:name,size:14) { fontNamesByDisplay[font.displayName ?? name] = name } }
        fontCombo.addItems(withTitles:fontNamesByDisplay.keys.sorted { $0.localizedStandardCompare($1) == .orderedAscending }); fontCombo.selectItem(withTitle:NSFont(name:model.fontName,size:14)?.displayName ?? "PingFang TC"); fontCombo.target=self; fontCombo.action=#selector(fontChanged(_:))
        let sizeField=NSTextField(string:"80"); sizeField.placeholderString="字體大小"; sizeField.target=self; sizeField.action=#selector(sizeChanged(_:)); sizeField.formatter=NumberFormatter()
        typography.addArrangedSubview(fontCombo); typography.addArrangedSubview(sizeField)
        root.addArrangedSubview(typography)
        root.addArrangedSubview(sliderRow("文字區域寬度（長句換行）", value: 72, min: 25, max: 95, action: #selector(textWidthChanged(_:)), suffix:"%"))

        let visualButtons = NSStackView(); visualButtons.orientation = .horizontal; visualButtons.spacing = 8; visualButtons.distribution = .fillEqually
        visualButtons.addArrangedSubview(button("背景顏色…", #selector(chooseBackgroundColor)))
        visualButtons.addArrangedSubview(button("背景圖片…", #selector(chooseBackgroundImage)))
        visualButtons.addArrangedSubview(button("文字顏色…", #selector(chooseTextColor)))
        root.addArrangedSubview(visualButtons)
        let gradientCheck=NSButton(checkboxWithTitle:"使用漸層背景",target:self,action:#selector(backgroundGradientToggled(_:))); root.addArrangedSubview(gradientCheck)
        let gradientButtons=NSStackView(); gradientButtons.orientation = .horizontal; gradientButtons.distribution = .fillEqually
        gradientButtons.addArrangedSubview(button("漸層色一…",#selector(chooseGradientStart))); gradientButtons.addArrangedSubview(button("漸層色二…",#selector(chooseGradientEnd))); root.addArrangedSubview(gradientButtons)

        root.addArrangedSubview(sectionLabel("聲音與淡入淡出"))
        silentCheck.target=self; silentCheck.action=#selector(silentModeChanged(_:)); root.addArrangedSubview(silentCheck)
        root.addArrangedSubview(button("開頭與結尾恢復使用內建磬聲",#selector(useBuiltInChime)))
        root.addArrangedSubview(audioRow("開頭磬聲", select: #selector(selectOpeningSound), volume: 30, fadeIn: #selector(openingFadeInChanged(_:)), fadeOut: #selector(openingFadeOutChanged(_:)), volumeAction: #selector(openingVolumeChanged(_:)), defaultsOn: true))
        root.addArrangedSubview(audioRow("背景音樂", select: #selector(selectMusic), volume: 30, fadeIn: #selector(musicFadeInChanged(_:)), fadeOut: #selector(musicFadeOutChanged(_:)), volumeAction: #selector(musicVolumeChanged(_:)), defaultsOn: true))
        root.addArrangedSubview(audioRow("結尾磬聲", select: #selector(selectClosingSound), volume: 30, fadeIn: #selector(closingFadeInChanged(_:)), fadeOut: #selector(closingFadeOutChanged(_:)), volumeAction: #selector(closingVolumeChanged(_:)), defaultsOn: true))
        musicCheck.target = self; musicCheck.action = #selector(musicToggled(_:)); root.addArrangedSubview(musicCheck)

        root.addArrangedSubview(sectionLabel("參與者視窗"))
        countdownCheck.target = self; countdownCheck.action = #selector(countdownToggled(_:)); root.addArrangedSubview(countdownCheck)
        let countdownFont=NSPopUpButton(); countdownFont.addItems(withTitles:fontNamesByDisplay.keys.sorted{$0.localizedStandardCompare($1) == .orderedAscending}); let countdownDisplay=NSFont(name:model.countdownFontName,size:14)?.displayName ?? ""; if countdownFont.itemTitles.contains(countdownDisplay) { countdownFont.selectItem(withTitle:countdownDisplay) } else if let fallback=countdownFont.itemTitles.first { countdownFont.selectItem(withTitle:fallback); model.countdownFontName=fontNamesByDisplay[fallback] ?? model.countdownFontName }; countdownFont.target=self; countdownFont.action=#selector(countdownFontChanged(_:)); let countdownFontRow=NSStackView(); countdownFontRow.orientation = .horizontal; countdownFontRow.addArrangedSubview(NSTextField(labelWithString:"倒數字體")); countdownFontRow.addArrangedSubview(countdownFont); root.addArrangedSubview(countdownFontRow)
        let progressStyle=NSPopUpButton(); progressStyle.addItems(withTitles:["圓環進度","直線進度"]); progressStyle.target=self; progressStyle.action=#selector(progressStyleChanged(_:)); root.addArrangedSubview(progressStyle)
        let progressColors=NSStackView(); progressColors.orientation = .horizontal; progressColors.distribution = .fillEqually
        progressColors.addArrangedSubview(button("進度起始色…",#selector(chooseProgressStart))); progressColors.addArrangedSubview(button("進度結束色…",#selector(chooseProgressEnd))); root.addArrangedSubview(progressColors)
        root.addArrangedSubview(sliderRow("倒數大小", value: 60, min: 18, max: 160, action: #selector(countdownSizeChanged(_:)), suffix:" pt"))
        root.addArrangedSubview(sliderRow("圓環／直線比例", value: 25, min: 8, max: 40, action: #selector(progressSizeChanged(_:)), suffix:"%"))
        alwaysOnTopCheck.target = self; alwaysOnTopCheck.action = #selector(alwaysOnTopToggled(_:)); root.addArrangedSubview(alwaysOnTopCheck)
        root.addArrangedSubview(button(isMenuBarController ? "切換到一般視窗模式" : "切換到選單列模式", #selector(toggleControlMode)))

        root.addArrangedSubview(button("顯示熱鍵說明…", #selector(showHotkeyHelp)))
        let hint = NSTextField(wrappingLabelWithString: "可直接在 16:9 顯示視窗拖曳文字位置。Zoom 分享時只選擇該視窗。")
        hint.alignment = .center; hint.textColor = .tertiaryLabelColor; hint.font = .systemFont(ofSize: 11)
        root.addArrangedSubview(hint)
    }

    private func bindModel() {
        model.onTimerChange = { [weak self] in self?.timerLabel.stringValue = self?.model.formattedRemaining ?? "" }
        model.onStateChange = { [weak self] in self?.refreshState() }
    }

    private static func remoteControlAddresses() -> String {
        var addresses = ["127.0.0.1:4747"]
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else {
            return "網頁控制：" + addresses[0]
        }
        defer { freeifaddrs(interfaces) }
        var pointer: UnsafeMutablePointer<ifaddrs>? = first
        while let current = pointer {
            let interface = current.pointee
            if let address = interface.ifa_addr, address.pointee.sa_family == UInt8(AF_INET) {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                let length = socklen_t(address.pointee.sa_len)
                if getnameinfo(address, length, &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                    let ip = String(cString: host)
                    let isUp = (interface.ifa_flags & UInt32(IFF_UP)) != 0
                    let isLoopback = (interface.ifa_flags & UInt32(IFF_LOOPBACK)) != 0
                    if isUp, !isLoopback, !ip.hasPrefix("169.254."), !addresses.contains("\(ip):4747") {
                        addresses.append("\(ip):4747")
                    }
                }
            }
            pointer = interface.ifa_next
        }
        return "網頁控制：" + addresses.joined(separator: "\n　　　　　")
    }

    private func header(_ title: String) -> NSTextField { let v = NSTextField(labelWithString: title); v.font = .systemFont(ofSize: 22, weight: .semibold); return v }
    private func sectionLabel(_ title: String) -> NSTextField { let v = NSTextField(labelWithString: title); v.font = .systemFont(ofSize: 13, weight: .semibold); v.textColor = .secondaryLabelColor; return v }
    private func button(_ title: String, _ action: Selector) -> NSButton { let b = NSButton(title: title, target: self, action: action); b.bezelStyle = .rounded; return b }
    private func fileRow(_ title: String, _ action: Selector) -> NSView {
        let row = NSStackView(); row.orientation = .horizontal; row.spacing = 8
        let label = NSTextField(labelWithString: title); label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        row.addArrangedSubview(label); row.addArrangedSubview(button("選擇…", action)); return row
    }

    private func sliderRow(_ title: String, value: Double, min: Double, max: Double, action: Selector, suffix:String = "") -> NSView {
        let row = NSStackView(); row.orientation = .horizontal; row.spacing = 8
        let label = NSTextField(labelWithString: title); label.setContentHuggingPriority(.required, for: .horizontal)
        let slider = NSSlider(value: value, minValue: min, maxValue: max, target: self, action: action); slider.isContinuous = true
        row.addArrangedSubview(label); row.addArrangedSubview(slider)
        if !suffix.isEmpty { let valueLabel=NSTextField(labelWithString:"\(Int(value))\(suffix)"); valueLabel.tag=901; valueLabel.alignment = .right; valueLabel.font = .monospacedDigitSystemFont(ofSize:12,weight:.regular); valueLabel.widthAnchor.constraint(equalToConstant:58).isActive=true; row.addArrangedSubview(valueLabel) }
        return row
    }

    private func audioRow(_ title: String, select: Selector, volume: Double, fadeIn: Selector, fadeOut: Selector, volumeAction: Selector, defaultsOn: Bool = false) -> NSView {
        let column = NSStackView(); column.orientation = .vertical; column.spacing = 6
        column.addArrangedSubview(fileRow(title, select))
        let row = NSStackView(); row.orientation = .horizontal; row.spacing = 7
        let volumeLabel = NSTextField(labelWithString: "音量")
        let slider = NSSlider(value: volume, minValue: 0, maxValue: 100, target: self, action: volumeAction); slider.isContinuous = true
        slider.widthAnchor.constraint(greaterThanOrEqualToConstant: 190).isActive = true
        let percent = NSTextField(labelWithString: "\(Int(volume))%")
        percent.alignment = .right; percent.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular); percent.widthAnchor.constraint(equalToConstant: 42).isActive = true
        volumeLabels[ObjectIdentifier(slider)] = percent
        row.addArrangedSubview(volumeLabel); row.addArrangedSubview(slider); row.addArrangedSubview(percent)
        let fades = NSStackView(); fades.orientation = .horizontal; fades.spacing = 14
        let fadeInCheck = NSButton(checkboxWithTitle: "淡入", target: self, action: fadeIn)
        let fadeOutCheck = NSButton(checkboxWithTitle: "淡出", target: self, action: fadeOut)
        if defaultsOn { fadeInCheck.state = .on; fadeOutCheck.state = .on }
        fades.addArrangedSubview(fadeInCheck); fades.addArrangedSubview(fadeOutCheck)
        column.addArrangedSubview(row); column.addArrangedSubview(fades); return column
    }

    @objc private func textChanged(_ sender: NSTextField) { model.displayText = sender.stringValue }
    @objc private func showCurrentTimeChanged(_ sender:NSButton) { model.showCurrentTime = sender.state == .on }
    @objc private func currentTimeFormatChanged(_ sender:NSPopUpButton) { model.currentTimeUses24Hour = sender.indexOfSelectedItem == 0 }
    @objc private func currentTimeSizeChanged(_ sender:NSSlider) { model.currentTimeFontSize = CGFloat(sender.doubleValue); updateSliderLabel(sender, suffix:" pt") }
    @objc private func fontChanged(_ sender: NSPopUpButton) {
        if let display=sender.titleOfSelectedItem, let name=fontNamesByDisplay[display] { model.fontName=name }
    }
    @objc private func sizeChanged(_ sender: NSTextField) { model.fontSize = CGFloat(min(max(sender.doubleValue,8),300)); sender.stringValue="\(Int(model.fontSize))" }
    @objc private func chooseBackgroundColor() { showColorPicker(initial: model.backgroundColor) { self.model.backgroundColor = $0 } }
    @objc private func chooseTextColor() { showColorPicker(initial: model.textColor) { self.model.textColor = $0 } }
    @objc private func chooseGradientStart() { showColorPicker(initial:model.backgroundGradientStart){self.model.backgroundGradientStart=$0} }
    @objc private func chooseGradientEnd() { showColorPicker(initial:model.backgroundGradientEnd){self.model.backgroundGradientEnd=$0} }
    @objc private func chooseProgressStart() { showColorPicker(initial:model.progressColorStart){self.model.progressColorStart=$0} }
    @objc private func chooseProgressEnd() { showColorPicker(initial:model.progressColorEnd){self.model.progressColorEnd=$0} }
    @objc private func backgroundGradientToggled(_ sender:NSButton) { model.backgroundGradientEnabled=sender.state == .on }
    @objc private func progressStyleChanged(_ sender:NSPopUpButton) { model.countdownProgressStyle=sender.indexOfSelectedItem==0 ? .ring:.line }
    private func showColorPicker(initial: NSColor, apply: @escaping (NSColor) -> Void) {
        (NSApp.delegate as? AppDelegate)?.ensureParticipantVisible()
        let panel = NSColorPanel.shared; panel.color = initial; ColorReceiver.shared.apply = apply; panel.setTarget(ColorReceiver.shared); panel.setAction(#selector(ColorReceiver.changed(_:))); panel.makeKeyAndOrderFront(nil)
    }
    @objc private func chooseBackgroundImage() { if let url = chooseFile(types: [.png, .jpeg, .tiff, .heic]), let image = NSImage(contentsOf: url) { model.backgroundImage = image } }
    @objc private func durationSelected(_ sender: NSButton) { durationButtons.forEach { $0.state = $0 === sender ? .on : .off }; model.selectedMinutes = sender.tag }
    @objc private func selectOpeningSound() { model.openingSoundURL = chooseFile(types: [.audio]) }
    @objc private func selectMusic() { model.musicURL = chooseFile(types: [.audio]); if model.musicURL != nil { musicCheck.state = .on; model.musicEnabled = true } }
    @objc private func selectClosingSound() { model.closingSoundURL = chooseFile(types: [.audio]) }
    @objc private func musicToggled(_ sender: NSButton) { model.musicEnabled = sender.state == .on }
    @objc private func silentModeChanged(_ sender:NSButton) { model.silentMode = sender.state == .on }
    @objc private func useBuiltInChime() { if let url=Bundle.main.url(forResource:"BuiltInChime",withExtension:"m4a") { model.openingSoundURL=url; model.closingSoundURL=url } }
    @objc private func textWidthChanged(_ sender: NSSlider) { model.textBoxWidth = CGFloat(sender.doubleValue / 100); (sender.superview as? NSStackView)?.arrangedSubviews.compactMap{$0 as? NSTextField}.first(where:{$0.tag==901})?.stringValue="\(Int(sender.doubleValue.rounded()))%" }
    @objc private func countdownFontChanged(_ sender:NSPopUpButton) { if let display=sender.titleOfSelectedItem, let name=fontNamesByDisplay[display] { model.countdownFontName=name } }
    @objc private func customDurationChanged(_ sender:NSTextField) { let minutes=min(max(sender.integerValue,1),999); sender.integerValue=minutes; durationButtons.forEach{$0.state = .off}; model.selectedMinutes=minutes }
    @objc private func countdownToggled(_ sender: NSButton) { model.showCountdown = sender.state == .on }
    @objc private func countdownSizeChanged(_ sender: NSSlider) { model.countdownFontSize = CGFloat(sender.doubleValue); updateSliderLabel(sender, suffix:" pt") }
    @objc private func progressSizeChanged(_ sender: NSSlider) { model.countdownProgressSize = CGFloat(sender.doubleValue / 100); (sender.superview as? NSStackView)?.arrangedSubviews.compactMap{$0 as? NSTextField}.first(where:{$0.tag==901})?.stringValue="\(Int(sender.doubleValue.rounded()))%" }
    @objc private func alwaysOnTopToggled(_ sender: NSButton) { model.alwaysOnTop = sender.state == .on }
    private func updateVolumeLabel(_ sender: NSSlider) { volumeLabels[ObjectIdentifier(sender)]?.stringValue = "\(Int(sender.doubleValue.rounded()))%" }
    private func updateSliderLabel(_ sender:NSSlider, suffix:String) { (sender.superview as? NSStackView)?.arrangedSubviews.compactMap{$0 as? NSTextField}.first(where:{$0.tag==901})?.stringValue="\(Int(sender.doubleValue.rounded()))\(suffix)" }
    @objc private func openingVolumeChanged(_ sender: NSSlider) { model.openingVolume = Float(sender.doubleValue / 100); updateVolumeLabel(sender) }
    @objc private func musicVolumeChanged(_ sender: NSSlider) { model.musicVolume = Float(sender.doubleValue / 100); updateVolumeLabel(sender) }
    @objc private func closingVolumeChanged(_ sender: NSSlider) { model.closingVolume = Float(sender.doubleValue / 100); updateVolumeLabel(sender) }
    @objc private func openingFadeInChanged(_ sender: NSButton) { model.openingFadeIn = sender.state == .on }
    @objc private func openingFadeOutChanged(_ sender: NSButton) { model.openingFadeOut = sender.state == .on }
    @objc private func musicFadeInChanged(_ sender: NSButton) { model.musicFadeIn = sender.state == .on }
    @objc private func musicFadeOutChanged(_ sender: NSButton) { model.musicFadeOut = sender.state == .on }
    @objc private func closingFadeInChanged(_ sender: NSButton) { model.closingFadeIn = sender.state == .on }
    @objc private func closingFadeOutChanged(_ sender: NSButton) { model.closingFadeOut = sender.state == .on }
    @objc private func toggleControlMode() { isMenuBarController ? (NSApp.delegate as? AppDelegate)?.showHostWindow() : (NSApp.delegate as? AppDelegate)?.hideHostWindow() }
    @objc private func showHotkeyHelp() { (NSApp.delegate as? AppDelegate)?.showHotkeyHelp() }
    @objc private func openRemoteControl() { NSWorkspace.shared.open(URL(string:"http://127.0.0.1:4747")!) }
    @objc private func startPressed() { model.startOrResume() }
    @objc private func pausePressed() { model.pause() }
    @objc private func resetPressed() { model.reset() }
    @objc private func finishPressed() {
        let alert = NSAlert(); alert.messageText = "要提早結束靜心嗎？"; alert.informativeText = "背景音樂會淡出，接著播放結尾磬聲。"; alert.addButton(withTitle: "提早結束"); alert.addButton(withTitle: "取消")
        if alert.runModal() == .alertFirstButtonReturn { model.finishEarly() }
    }

    private func chooseFile(types: [UTType]) -> URL? { (NSApp.delegate as? AppDelegate)?.ensureParticipantVisible(); let panel = NSOpenPanel(); panel.allowedContentTypes = types; panel.allowsMultipleSelection = false; return panel.runModal() == .OK ? panel.url : nil }
    private func updateClock() {
        let formatter = DateFormatter(); formatter.timeStyle = .medium
        clockLabel.stringValue = "現在時間  \(formatter.string(from: Date()))"
        timerLabel.stringValue = model.formattedRemaining
        refreshState()
    }
    private func refreshState() {
        switch model.state {
        case .ready: startButton.title = "開始"; statusLabel.stringValue = "準備完成，尚未開始"
        case .running: startButton.title = "進行中"; statusLabel.stringValue = "靜心進行中"
        case .paused: startButton.title = "繼續"; statusLabel.stringValue = "已暫停（參與者畫面不變）"
        case .finished: startButton.title = "再次開始"; statusLabel.stringValue = "靜心已完成"
        }
        let canChange = model.state == .ready || model.state == .finished
        durationButtons.forEach { $0.isEnabled = canChange }
    }
}

private final class ColorReceiver: NSObject {
    static let shared = ColorReceiver()
    var apply: ((NSColor) -> Void)?
    @objc func changed(_ sender: NSColorPanel) { apply?(sender.color) }
}

private final class FlippedView:NSView { override var isFlipped:Bool { true } }
