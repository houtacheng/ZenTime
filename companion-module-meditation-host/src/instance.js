import { InstanceBase, InstanceStatus, combineRgb } from '@companion-module/base'

export class MeditationHostInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = { state: 'unknown', remainingText: '--:--', remaining: 0, selectedMinutes: 10 }
    this.setVariableDefinitions([
      { variableId: 'remaining', name: '動態倒數時間' },
      { variableId: 'remaining_seconds', name: '剩餘秒數' },
      { variableId: 'state', name: '目前狀態' },
      { variableId: 'selected_minutes', name: '設定分鐘' },
      { variableId: 'show_countdown', name: '是否顯示倒數' },
      { variableId: 'show_clock', name: '是否顯示目前時間' },
      { variableId: 'show_text', name: '是否顯示主文字' },
      { variableId: 'always_on_top', name: '參與者畫面是否置頂' },
    ])
    this.setActionDefinitions(this.actions())
    this.setFeedbackDefinitions(this.feedbacks())
    this.setPresetDefinitions(this.presets())
    this.startPolling()
  }

  async configUpdated(config) { this.config = config; this.startPolling() }
  async destroy() { clearInterval(this.pollTimer) }

  getConfigFields() {
    return [
      { type: 'textinput', id: 'host', label: 'App 位址', width: 8, default: '127.0.0.1' },
      { type: 'number', id: 'port', label: 'API 連接埠', width: 4, default: 4747, min: 1, max: 65535 },
    ]
  }

  baseURL() { return `http://${this.config.host || '127.0.0.1'}:${this.config.port || 4747}` }
  async request(path) {
    const response = await fetch(`${this.baseURL()}${path}`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  }
  async command(path) { try { this.updateState(await this.request(path)) } catch (e) { this.log('error', e.message); this.updateStatus(InstanceStatus.ConnectionFailure, e.message) } }
  startPolling() {
    clearInterval(this.pollTimer)
    const poll = async () => { try { this.updateState(await this.request('/api/state')); this.updateStatus(InstanceStatus.Ok) } catch { this.updateStatus(InstanceStatus.Disconnected, '找不到靜心主持台 App') } }
    poll(); this.pollTimer = setInterval(poll, 250)
  }
  updateState(state) {
    this.state = state
    this.setVariableValues({ remaining: state.remainingText, remaining_seconds: state.remaining, state: state.state, selected_minutes: state.selectedMinutes, show_countdown: state.showCountdown ? '顯示':'隱藏', show_clock: state.showClock ? '顯示':'隱藏', show_text: state.showText ? '顯示':'隱藏', always_on_top: state.alwaysOnTop ? '啟用':'取消' })
    this.checkFeedbacks('running', 'paused', 'show_countdown', 'show_clock', 'show_text', 'always_on_top')
  }

  actions() {
    return {
      start: { name: '開始／繼續', options: [], callback: () => this.command('/api/start') },
      pause: { name: '暫停', options: [], callback: () => this.command('/api/pause') },
      toggle: { name: '暫停／繼續切換', options: [], callback: () => this.command('/api/toggle') },
      reset: { name: '重新準備', options: [], callback: () => this.command('/api/reset') },
      finish: { name: '提早結束', options: [], callback: () => this.command('/api/finish') },
      toggle_countdown: { name: '顯示／隱藏倒數計時', options: [], callback: () => this.command('/api/toggle-countdown') },
      toggle_clock: { name: '顯示／隱藏目前時間', options: [], callback: () => this.command('/api/toggle-clock') },
      toggle_text: { name: '顯示／隱藏主文字', options: [], callback: () => this.command('/api/toggle-text') },
      toggle_always_on_top: { name: '啟用／取消參與者畫面置頂', options: [], callback: () => this.command('/api/toggle-always-on-top') },
      duration: {
        name: '設定靜心分鐘',
        options: [{ type: 'number', id: 'minutes', label: '分鐘', default: 10, min: 1, max: 999, required: true }],
        callback: event => this.command(`/api/duration?minutes=${Math.round(event.options.minutes)}`),
      },
    }
  }
  feedbacks() {
    return {
      running: { name: '正在進行', type: 'boolean', defaultStyle: { bgcolor: combineRgb(0, 140, 65), color: combineRgb(255,255,255) }, options: [], callback: () => this.state.state === 'running' },
      paused: { name: '已暫停', type: 'boolean', defaultStyle: { bgcolor: combineRgb(215, 140, 0), color: combineRgb(0,0,0) }, options: [], callback: () => this.state.state === 'paused' },
      show_countdown: { name: '倒數正在顯示', type: 'boolean', defaultStyle: { bgcolor: '#cc2222', color: '#ffffff' }, options: [], callback: () => this.state.showCountdown === true },
      show_clock: { name: '目前時間正在顯示', type: 'boolean', defaultStyle: { bgcolor: '#cc2222', color: '#ffffff' }, options: [], callback: () => this.state.showClock === true },
      show_text: { name: '主文字正在顯示', type: 'boolean', defaultStyle: { bgcolor: '#cc2222', color: '#ffffff' }, options: [], callback: () => this.state.showText === true },
      always_on_top: { name: '參與者畫面正在置頂', type: 'boolean', defaultStyle: { bgcolor: '#cc2222', color: '#ffffff' }, options: [], callback: () => this.state.alwaysOnTop === true },
    }
  }
  presets() {
    const style = { text: '', size: '18', color: '#ffffff', bgcolor: '#000000', alignment: 'center:center' }
    const button = (name, text, actionId, options = {}) => { const buttonStyle={ ...style, text }; return { type: 'button', category: '靜心主持台', name, style: buttonStyle, previewStyle: buttonStyle, steps: [{ down: [{ actionId, options }], up: [] }], feedbacks: [] } }
    const presets = {
      start: button('開始', '開始', 'start'), pause: button('暫停／繼續', '暫停\n繼續', 'toggle'), reset: button('重新準備', '重新\n準備', 'reset'), finish: button('提早結束', '提早\n結束', 'finish'),
      countdown: { type: 'button', category: '靜心主持台', name: '動態倒數', style: { ...style, text: '$(this:remaining)', size: '24' }, steps: [], feedbacks: [] },
      toggle_countdown: { ...button('顯示／隱藏倒數', '倒數\n顯示', 'toggle_countdown'), feedbacks: [{ feedbackId: 'show_countdown', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_clock: { ...button('顯示／隱藏目前時間', '時間\n顯示', 'toggle_clock'), feedbacks: [{ feedbackId: 'show_clock', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_text: { ...button('顯示／隱藏主文字', '文字\n顯示', 'toggle_text'), feedbacks: [{ feedbackId: 'show_text', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_always_on_top: { ...button('啟用／取消參與者畫面置頂', '畫面\n置頂', 'toggle_always_on_top'), feedbacks: [{ feedbackId: 'always_on_top', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
    }
    for (const minutes of [3,5,7,10,15,20]) presets[`duration_${minutes}`] = button(`${minutes} 分鐘`, `${minutes}\n分鐘`, 'duration', { minutes })
    presets.duration_custom = button('自訂分鐘', '自訂\n分鐘', 'duration', { minutes: 12 })
    return presets
  }
}
