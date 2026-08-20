import AppKit
import CoreText

final class ParticipantView: NSView {
    private enum DragTarget { case none, clock, text, countdown }
    private let imageView = NSImageView()
    private let clockField = NSTextField(labelWithString: "")
    private let textField = NSTextField(labelWithString: "")
    private let countdownField = NSTextField(labelWithString: "10:00")
    private let progressView = CountdownProgressView()
    private var dragTarget: DragTarget = .none
    private var dragOffset = CGPoint.zero
    private var activeVerticalGuides: [CGFloat] = []
    private var activeHorizontalGuides: [CGFloat] = []
    private var lastSnapKey = ""
    private var clockTimer: Timer?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        imageView.imageScaling = .scaleAxesIndependently
        addSubview(imageView)
        configure(clockField)
        configure(textField)
        configure(countdownField)
        countdownField.font = .monospacedDigitSystemFont(ofSize: 34, weight: .medium)
        clockField.font = .monospacedDigitSystemFont(ofSize: 28, weight: .regular)
        clockField.textColor = .white
        addSubview(clockField)
        addSubview(textField)
        addSubview(countdownField)
        addSubview(progressView, positioned: .below, relativeTo: countdownField)
        AppModel.shared.onVisualChange = { [weak self] in self?.refresh() }
        updateClock()
        clockTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.updateClock() }
        if let clockTimer { RunLoop.main.add(clockTimer, forMode: .common) }
        refresh()
    }

    required init?(coder: NSCoder) { fatalError() }

    deinit { clockTimer?.invalidate() }

    private func configure(_ field: NSTextField) {
        field.alignment = .center
        field.maximumNumberOfLines = 0
        field.lineBreakMode = .byWordWrapping
        field.isSelectable = false
    }

    override func layout() {
        super.layout()
        imageView.frame = bounds
        positionElements()
    }

    func refresh() {
        let model = AppModel.shared
        layer?.backgroundColor = model.backgroundColor.cgColor
        imageView.image = model.backgroundImage
        imageView.isHidden = model.backgroundImage == nil
        textField.stringValue = model.displayText
        textField.textColor = model.textColor
        textField.font = NSFont(name: model.fontName, size: model.fontSize) ?? .systemFont(ofSize: model.fontSize, weight: .semibold)
        clockField.isHidden = !model.showCurrentTime
        clockField.font = .monospacedDigitSystemFont(ofSize:model.currentTimeFontSize,weight:.regular)
        countdownField.textColor = model.textColor
        countdownField.font = countdownFont(name: model.countdownFontName, size: model.countdownFontSize)
        countdownField.attributedStringValue = fixedWidthCountdown(model.formattedRemaining, font: countdownField.font!, color: model.textColor)
        countdownField.isHidden = !model.showCountdown
        progressView.isHidden = !model.showCountdown
        progressView.progress = model.countdownProgress
        progressView.style = model.countdownProgressStyle
        progressView.startColor = model.progressColorStart
        progressView.endColor = model.progressColorEnd
        positionElements()
        needsDisplay = true
    }

    private func positionElements() {
        let model = AppModel.shared
        let clockSample = model.currentTimeUses24Hour ? "00:00:00" : "下午 00:00:00"
        clockField.frame.size.width = ceil((clockSample as NSString).size(withAttributes:[.font:clockField.font as Any]).width)+18
        clockField.frame.size.height = model.currentTimeFontSize * 1.35
        place(clockField, at: model.currentTimePosition)
        textField.frame.size.width = max(100, bounds.width * model.textBoxWidth)
        textField.frame.size.height = max(textField.fittingSize.height, model.fontSize * 1.4)
        place(textField, at: model.textPosition)
        let center = CGPoint(x: model.countdownPosition.x * bounds.width, y: model.countdownPosition.y * bounds.height)
        let stableCountdownWidth = fixedCountdownWidth(font: countdownField.font!)
        countdownField.frame.size = NSSize(width: ceil(stableCountdownWidth) + 18, height: model.countdownFontSize * 1.35)
        countdownField.frame.origin = CGPoint(x: center.x-countdownField.frame.width/2, y: center.y-countdownField.frame.height/2)
        let progressWidth = max(80, bounds.width * model.countdownProgressSize)
        if model.countdownProgressStyle == .ring {
            progressView.frame=NSRect(x:center.x-progressWidth/2,y:center.y-progressWidth/2,width:progressWidth,height:progressWidth)
        } else {
            progressView.frame=NSRect(x:center.x-progressWidth/2,y:countdownField.frame.minY-15,width:progressWidth,height:8)
        }
    }

    private func place(_ field: NSTextField, at point: CGPoint) {
        field.frame.origin = CGPoint(x: point.x * bounds.width - field.frame.width / 2, y: point.y * bounds.height - field.frame.height / 2)
    }

    private func updateClock() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier:"zh_Hant_TW")
        formatter.dateFormat = AppModel.shared.currentTimeUses24Hour ? "HH:mm:ss":"a h:mm:ss"
        clockField.stringValue = formatter.string(from: Date())
        if bounds.width > 0 { positionElements() }
    }

    private func countdownFont(name: String, size: CGFloat) -> NSFont {
        guard let base = NSFont(name: name, size: size) else {
            return .monospacedDigitSystemFont(ofSize: size, weight: .medium)
        }
        let features: [[NSFontDescriptor.FeatureKey: Int]] = [[
            .typeIdentifier: kNumberSpacingType,
            .selectorIdentifier: kMonospacedNumbersSelector
        ]]
        let descriptor = base.fontDescriptor.addingAttributes([.featureSettings: features])
        return NSFont(descriptor: descriptor, size: size) ?? base
    }

    private func digitCellWidth(font: NSFont) -> CGFloat {
        (0...9).map { ("\($0)" as NSString).size(withAttributes: [.font: font]).width }.max() ?? font.pointSize * 0.7
    }

    private func fixedCountdownWidth(font: NSFont) -> CGFloat {
        digitCellWidth(font: font) * 4 + (":" as NSString).size(withAttributes: [.font: font]).width
    }

    private func fixedWidthCountdown(_ text: String, font: NSFont, color: NSColor) -> NSAttributedString {
        let result = NSMutableAttributedString()
        let cell = digitCellWidth(font: font)
        for character in text {
            let value = String(character)
            let width = (value as NSString).size(withAttributes: [.font: font]).width
            var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
            if character.isNumber { attributes[.kern] = max(0, cell-width) }
            result.append(NSAttributedString(string: value, attributes: attributes))
        }
        return result
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let model=AppModel.shared
        if model.backgroundGradientEnabled, model.backgroundImage == nil, let gradient=NSGradient(starting:model.backgroundGradientStart,ending:model.backgroundGradientEnd) { gradient.draw(in:bounds,angle:45) }
        guard dragTarget != .none else { return }
        let grid = NSBezierPath(); grid.lineWidth = 1; grid.setLineDash([5, 5], count: 2, phase: 0)
        NSColor.white.withAlphaComponent(0.38).setStroke()
        for fraction in [0.25, 0.5, 0.75] {
            let x = bounds.width * fraction; grid.move(to: CGPoint(x:x,y:0)); grid.line(to: CGPoint(x:x,y:bounds.height))
            let y = bounds.height * fraction; grid.move(to: CGPoint(x:0,y:y)); grid.line(to: CGPoint(x:bounds.width,y:y))
        }
        grid.stroke()
        NSColor.systemYellow.withAlphaComponent(0.9).setStroke()
        let active = NSBezierPath(); active.lineWidth = 1.5
        activeVerticalGuides.forEach { active.move(to: CGPoint(x:$0,y:0)); active.line(to: CGPoint(x:$0,y:bounds.height)) }
        activeHorizontalGuides.forEach { active.move(to: CGPoint(x:0,y:$0)); active.line(to: CGPoint(x:bounds.width,y:$0)) }
        active.stroke()
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if !clockField.isHidden, clockField.frame.insetBy(dx:-8,dy:-8).contains(point) {
            dragTarget = .clock; dragOffset = CGPoint(x:point.x-clockField.frame.midX,y:point.y-clockField.frame.midY)
        } else if !countdownField.isHidden, countdownField.frame.insetBy(dx: -8, dy: -8).contains(point) {
            dragTarget = .countdown; dragOffset = CGPoint(x: point.x - countdownField.frame.midX, y: point.y - countdownField.frame.midY)
        } else if textField.frame.insetBy(dx: -8, dy: -8).contains(point) {
            dragTarget = .text; dragOffset = CGPoint(x: point.x - textField.frame.midX, y: point.y - textField.frame.midY)
        } else {
            dragTarget = .none
            window?.performDrag(with: event)
        }
        if dragTarget != .none { AppModel.shared.beginPositionChange() }
    }

    override func mouseDragged(with event: NSEvent) {
        guard dragTarget != .none else { return }
        let point = convert(event.locationInWindow, from: nil)
        var center = CGPoint(x: point.x - dragOffset.x, y: point.y - dragOffset.y)
        let moving: NSTextField
        switch dragTarget { case .clock:moving=clockField; case .text:moving=textField; case .countdown:moving=countdownField; case .none:return }
        let others = [clockField,textField,countdownField].filter{$0 !== moving && !$0.isHidden}
        let threshold: CGFloat = 11
        activeVerticalGuides.removeAll(); activeHorizontalGuides.removeAll()
        var snapParts: [String] = []

        let gridX = [bounds.width*0.25, bounds.width*0.5, bounds.width*0.75]
        let gridY = [bounds.height*0.25, bounds.height*0.5, bounds.height*0.75]
        if let target = gridX.min(by: { abs($0-center.x) < abs($1-center.x) }), abs(target-center.x) <= threshold { center.x=target; activeVerticalGuides.append(target); snapParts.append("gx\(Int(target))") }
        if let target = gridY.min(by: { abs($0-center.y) < abs($1-center.y) }), abs(target-center.y) <= threshold { center.y=target; activeHorizontalGuides.append(target); snapParts.append("gy\(Int(target))") }

        for other in others {
            let xCandidates: [(CGFloat,CGFloat)] = [(center.x,other.frame.midX),(center.x-moving.frame.width/2,other.frame.minX),(center.x+moving.frame.width/2,other.frame.maxX)]
            if let match=xCandidates.min(by:{abs($0.0-$0.1)<abs($1.0-$1.1)}), abs(match.0-match.1)<=threshold { center.x += match.1-match.0; activeVerticalGuides.append(match.1); snapParts.append("ox\(Int(match.1))") }
            let yCandidates: [(CGFloat,CGFloat)] = [(center.y,other.frame.midY),(center.y-moving.frame.height/2,other.frame.minY),(center.y+moving.frame.height/2,other.frame.maxY)]
            if let match=yCandidates.min(by:{abs($0.0-$0.1)<abs($1.0-$1.1)}), abs(match.0-match.1)<=threshold { center.y += match.1-match.0; activeHorizontalGuides.append(match.1); snapParts.append("oy\(Int(match.1))") }
        }
        let snapKey=snapParts.joined(separator:"-")
        if !snapKey.isEmpty, snapKey != lastSnapKey { NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now) }
        lastSnapKey=snapKey; needsDisplay = true
        let normalized = CGPoint(x: min(max(center.x / max(bounds.width, 1), 0.03), 0.97), y: min(max(center.y / max(bounds.height, 1), 0.05), 0.95))
        if dragTarget == .text { AppModel.shared.textPosition = normalized }
        if dragTarget == .countdown { AppModel.shared.countdownPosition = normalized }
        if dragTarget == .clock { AppModel.shared.currentTimePosition = normalized }
    }

    override func mouseUp(with event: NSEvent) {
        if dragTarget != .none { AppModel.shared.commitPositionChange() }
        dragTarget = .none; activeVerticalGuides.removeAll(); activeHorizontalGuides.removeAll(); lastSnapKey=""; needsDisplay = true
    }
}

final class CountdownProgressView:NSView {
    var progress:CGFloat=1 { didSet{needsDisplay=true} }
    var style:CountdownProgressStyle = .ring { didSet{needsDisplay=true} }
    var startColor=NSColor.systemGreen { didSet{needsDisplay=true} }
    var endColor=NSColor.systemYellow { didSet{needsDisplay=true} }
    override var isOpaque:Bool { false }
    override func hitTest(_ point:NSPoint)->NSView? { nil }
    override func draw(_ dirtyRect:NSRect) {
        super.draw(dirtyRect)
        let p=max(0,min(1,progress)); let gradient=NSGradient(starting:startColor,ending:endColor)!
        if style == .line {
            let track=NSBezierPath(roundedRect:bounds,xRadius:bounds.height/2,yRadius:bounds.height/2); NSColor.white.withAlphaComponent(0.18).setFill(); track.fill()
            let fill=NSBezierPath(roundedRect:NSRect(x:0,y:0,width:bounds.width*p,height:bounds.height),xRadius:bounds.height/2,yRadius:bounds.height/2)
            NSGraphicsContext.saveGraphicsState(); fill.addClip(); gradient.draw(in:bounds,angle:0); NSGraphicsContext.restoreGraphicsState()
        } else {
            let lineWidth:CGFloat=6; let rect=bounds.insetBy(dx:lineWidth,dy:lineWidth)
            let track=NSBezierPath(ovalIn:rect); track.lineWidth=lineWidth; NSColor.white.withAlphaComponent(0.16).setStroke(); track.stroke()
            let segments=max(1,Int(100*p)); let radius=min(rect.width,rect.height)/2
            for index in 0..<segments {
                let fraction=CGFloat(index)/100; let color=startColor.blended(withFraction:fraction,of:endColor) ?? startColor; color.setStroke()
                let path=NSBezierPath(); path.lineWidth=lineWidth; path.lineCapStyle = .round
                path.appendArc(withCenter:CGPoint(x:bounds.midX,y:bounds.midY),radius:radius,startAngle:90-360*CGFloat(index)/100,endAngle:90-360*CGFloat(index+1)/100,clockwise:true); path.stroke()
            }
        }
    }
}
