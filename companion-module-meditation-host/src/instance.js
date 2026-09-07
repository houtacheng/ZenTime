import { InstanceBase, InstanceStatus, combineRgb } from '@companion-module/base'

const SELECTED_DURATION_BORDER = 'iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAAq0lEQVR4nO3QwQmAQBAEwc0/QcM5I5D2dR5YDfMfatY1y543Xx84fYAAAdoPND8NUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFgCJAEaAIUAQoAhQBigBFr4EMECBAgM7YDdIh07+6k3VpAAAAAElFTkSuQmCC'

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
      { variableId: 'reminder_elapsed', name: '提醒器已進行時間' },
      { variableId: 'reminder_next', name: '距離下次提醒' },
      { variableId: 'reminder_status', name: '提醒器狀態' },
      { variableId: 'reminder_interval', name: '提醒間隔分鐘' },
      { variableId: 'reminder_timed_enabled', name: '定時提醒視窗是否啟用' },
      { variableId: 'reminder_temporary_enabled', name: '臨時提醒視窗是否啟用' },
      { variableId: 'reminder_marquee_enabled', name: '跑馬燈視窗是否啟用' },
      { variableId: 'reminder_image_enabled', name: '圖片提醒視窗是否啟用' },
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
  async post(path, body) { try { const response=await fetch(`${this.baseURL()}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(1800)});if(!response.ok)throw Error(`HTTP ${response.status}`);this.updateState(await response.json()) } catch(e){this.log('error',e.message);this.updateStatus(InstanceStatus.ConnectionFailure,e.message)} }
  startPolling() {
    clearInterval(this.pollTimer)
    const poll = async () => { try { this.updateState(await this.request('/api/state')); this.updateStatus(InstanceStatus.Ok) } catch { this.updateStatus(InstanceStatus.Disconnected, '找不到靜心主持台 App') } }
    poll(); this.pollTimer = setInterval(poll, 250)
  }
  updateState(state) {
    this.state = state
    const r=state.reminder||{}
    this.setVariableValues({ remaining: state.remainingText, remaining_seconds: state.remaining, state: state.state, selected_minutes: state.selectedMinutes, show_countdown: state.showCountdown ? '顯示':'隱藏', show_clock: state.showClock ? '顯示':'隱藏', show_text: state.showText ? '顯示':'隱藏', always_on_top: state.alwaysOnTop ? '啟用':'取消', reminder_elapsed:r.elapsedText||'00:00',reminder_next:r.nextText||'--:--',reminder_status:r.status||'idle',reminder_interval:r.intervalMinutes||0,reminder_timed_enabled:r.timedEnabled?'啟用':'停用',reminder_temporary_enabled:r.temporaryEnabled?'啟用':'停用',reminder_marquee_enabled:r.marqueeEnabled?'啟用':'停用',reminder_image_enabled:r.imageEnabled?'啟用':'停用' })
    this.checkFeedbacks('running', 'paused', 'show_countdown', 'show_clock', 'show_text', 'always_on_top', 'selected_duration','reminder_running','reminder_visible','reminder_interval','temporary_visible','marquee_visible','image_visible','reminder_timed_enabled','reminder_temporary_enabled','reminder_marquee_enabled','reminder_image_enabled')
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
      reminder_start: { name:'提醒器：開始／繼續',options:[],callback:()=>this.command('/api/reminder/start') },
      reminder_pause: { name:'提醒器：暫停',options:[],callback:()=>this.command('/api/reminder/pause') },
      reminder_toggle_pause: { name:'提醒器：暫停／繼續切換',options:[],callback:()=>this.command(this.state.reminder?.status==='running'?'/api/reminder/pause':'/api/reminder/start') },
      reminder_reset: { name:'提醒器：重設',options:[],callback:()=>this.command('/api/reminder/reset') },
      reminder_trigger: { name:'提醒器：中途提醒',options:[],callback:()=>this.command('/api/reminder/trigger') },
      reminder_interval: { name:'提醒器：設定間隔',options:[{type:'number',id:'minutes',label:'分鐘',default:10,min:1,max:1440,required:true}],callback:e=>this.post('/api/reminder/config',{intervalMinutes:Math.round(e.options.minutes)}) },
      reminder_bind: { name:'提醒器：綁定／取消綁定靜心',options:[],callback:()=>this.post('/api/reminder/config',{boundToMeditation:!this.state.reminder?.boundToMeditation}) },
      reminder_toggle_timed: { name:'提醒視窗：啟用／停用定時提醒',options:[],callback:()=>this.post('/api/reminder/config',{timedEnabled:!this.state.reminder?.timedEnabled}) },
      reminder_toggle_temporary: { name:'提醒視窗：啟用／停用臨時提醒',options:[],callback:()=>this.post('/api/reminder/config',{temporaryEnabled:!this.state.reminder?.temporaryEnabled}) },
      reminder_toggle_marquee: { name:'提醒視窗：啟用／停用跑馬燈',options:[],callback:()=>this.post('/api/reminder/config',{marqueeEnabled:!this.state.reminder?.marqueeEnabled}) },
      reminder_toggle_image: { name:'提醒視窗：啟用／停用圖片提醒',options:[],callback:()=>this.post('/api/reminder/config',{imageEnabled:!this.state.reminder?.imageEnabled}) },
      temporary_show: { name:'臨時提醒：顯示文字',options:[{type:'textinput',id:'text',label:'提醒文字',default:'請保持安靜',required:true},{type:'number',id:'seconds',label:'顯示秒數',default:8,min:1,max:300}],callback:e=>this.post('/api/reminder/temp/show',{text:e.options.text,durationSeconds:e.options.seconds}) },
      temporary_hide: { name:'臨時提醒：隱藏',options:[],callback:()=>this.command('/api/reminder/temp/hide') },
      marquee_show: { name:'跑馬燈：顯示文字',options:[{type:'textinput',id:'text',label:'跑馬燈文字',default:'活動即將開始',required:true},{type:'dropdown',id:'direction',label:'排列與方向',default:'rtl',choices:[{id:'rtl',label:'橫式・右到左'},{id:'ltr',label:'橫式・左到右'},{id:'ttb',label:'直式・從上到下'},{id:'btt',label:'直式・從下到上'}]}],callback:e=>this.post('/api/reminder/marquee/show',{text:e.options.text,direction:e.options.direction,layout:['ttb','btt'].includes(e.options.direction)?'vertical':'horizontal'}) },
      marquee_toggle: { name:'跑馬燈：顯示／取消',options:[{type:'textinput',id:'text',label:'跑馬燈文字',default:'活動即將開始',required:true},{type:'dropdown',id:'direction',label:'排列與方向',default:'rtl',choices:[{id:'rtl',label:'橫式・右到左'},{id:'ltr',label:'橫式・左到右'},{id:'ttb',label:'直式・從上到下'},{id:'btt',label:'直式・從下到上'}]}],callback:e=>this.state.reminder?.marquee?.active?this.command('/api/reminder/marquee/hide'):this.post('/api/reminder/marquee/show',{text:e.options.text,direction:e.options.direction,layout:['ttb','btt'].includes(e.options.direction)?'vertical':'horizontal'}) },
      marquee_hide: { name:'跑馬燈：停止',options:[],callback:()=>this.command('/api/reminder/marquee/hide') },
      image_show: { name:'圖片提醒：顯示網址',options:[{type:'textinput',id:'url',label:'PNG 圖片網址或 Data URL',default:'',required:true},{type:'number',id:'seconds',label:'顯示秒數',default:10,min:1,max:300}],callback:e=>this.post('/api/reminder/image/show',{url:e.options.url,durationSeconds:e.options.seconds}) },
      image_hide: { name:'圖片提醒：隱藏',options:[],callback:()=>this.command('/api/reminder/image/hide') },
      reminder_hide_all: { name:'提醒：隱藏全部',options:[],callback:()=>this.command('/api/reminder/hide-all') },
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
      selected_duration: {
        name: '目前選用的倒計時分鐘',
        type: 'boolean',
        defaultStyle: { png64: SELECTED_DURATION_BORDER },
        options: [{ type: 'number', id: 'minutes', label: '分鐘', default: 10, min: 1, max: 999, required: true }],
        callback: event => this.state.selectedMinutes === Math.round(Number(event.options.minutes)),
      },
      reminder_running:{name:'提醒器正在進行',type:'boolean',defaultStyle:{bgcolor:'#188f49',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.status==='running'},
      reminder_visible:{name:'定時／中途提醒正在顯示',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>!!this.state.reminder?.timed},
      temporary_visible:{name:'臨時提醒正在顯示',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.temporaryVisible===true},
      marquee_visible:{name:'跑馬燈正在顯示',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.marquee?.active===true},
      image_visible:{name:'圖片提醒正在顯示',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.imageVisible===true},
      reminder_interval:{name:'目前提醒間隔',type:'boolean',defaultStyle:{png64:SELECTED_DURATION_BORDER},options:[{type:'number',id:'minutes',label:'分鐘',default:10,min:1,max:1440}],callback:e=>this.state.reminder?.intervalMinutes===Math.round(Number(e.options.minutes))},
      reminder_timed_enabled:{name:'定時提醒視窗已啟用',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.timedEnabled===true},
      reminder_temporary_enabled:{name:'臨時提醒視窗已啟用',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.temporaryEnabled===true},
      reminder_marquee_enabled:{name:'跑馬燈視窗已啟用',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.marqueeEnabled===true},
      reminder_image_enabled:{name:'圖片提醒視窗已啟用',type:'boolean',defaultStyle:{bgcolor:'#cc2222',color:'#ffffff'},options:[],callback:()=>this.state.reminder?.imageEnabled===true},
    }
  }
  presets() {
    const style = { text: '', size: '18', color: '#ffffff', bgcolor: '#000000', alignment: 'center:center' }
    const button = (name, text, actionId, options = {}) => { const buttonStyle={ ...style, text }; return { type: 'button', category: '靜心主持台', name, style: buttonStyle, previewStyle: buttonStyle, steps: [{ down: [{ actionId, options }], up: [] }], feedbacks: [] } }
    const presets = {
      start: button('開始', '開始', 'start'), pause: button('暫停／繼續', '暫停\n繼續', 'toggle'), reset: button('重新準備', '重新\n準備', 'reset'), finish: button('提早結束', '提早\n結束', 'finish'),
      countdown: { type: 'button', category: '靜心主持台', name: '動態倒數', style: { ...style, text: '$(Meditation:remaining)', size: '24' }, steps: [], feedbacks: [] },
      toggle_countdown: { ...button('顯示／隱藏倒數', '倒數\n顯示', 'toggle_countdown'), feedbacks: [{ feedbackId: 'show_countdown', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_clock: { ...button('顯示／隱藏目前時間', '時間\n顯示', 'toggle_clock'), feedbacks: [{ feedbackId: 'show_clock', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_text: { ...button('顯示／隱藏主文字', '文字\n顯示', 'toggle_text'), feedbacks: [{ feedbackId: 'show_text', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
      toggle_always_on_top: { ...button('啟用／取消參與者畫面置頂', '畫面\n置頂', 'toggle_always_on_top'), feedbacks: [{ feedbackId: 'always_on_top', options: {}, style: { bgcolor: '#cc2222', color: '#ffffff' } }] },
    }
    for (const minutes of [3,5,7,10,15,20]) presets[`duration_${minutes}`] = { ...button(`${minutes} 分鐘`, `${minutes}\n分鐘`, 'duration', { minutes }), feedbacks: [{ feedbackId: 'selected_duration', options: { minutes }, style: { png64: SELECTED_DURATION_BORDER } }] }
    presets.duration_custom = { ...button('自訂分鐘', '自訂\n分鐘', 'duration', { minutes: 12 }), feedbacks: [{ feedbackId: 'selected_duration', options: { minutes: 12 }, style: { png64: SELECTED_DURATION_BORDER } }] }
    presets.reminder_start={...button('提醒器開始','提醒\n開始','reminder_start'),feedbacks:[{feedbackId:'reminder_running',options:{},style:{bgcolor:'#188f49',color:'#ffffff'}}]}
    presets.reminder_pause={...button('提醒器暫停／繼續','暫停\n繼續','reminder_toggle_pause'),feedbacks:[{feedbackId:'reminder_running',options:{},style:{bgcolor:'#188f49',color:'#ffffff'}}]};presets.reminder_reset=button('提醒器重設','提醒\n重設','reminder_reset');presets.reminder_trigger={...button('中途提醒','中途\n提醒','reminder_trigger'),feedbacks:[{feedbackId:'reminder_visible',options:{},style:{bgcolor:'#cc2222',color:'#ffffff'}}]}
    presets.reminder_time={type:'button',category:'時間提醒',name:'提醒時間',style:{...style,text:'$(Meditation:reminder_elapsed)\n下次 $(Meditation:reminder_next)',size:'15'},steps:[],feedbacks:[]}
    for(const minutes of [5,10,15,30])presets[`reminder_interval_${minutes}`]={...button(`提醒每 ${minutes} 分鐘`,`${minutes}\n分鐘`,'reminder_interval',{minutes}),category:'時間提醒',feedbacks:[{feedbackId:'reminder_interval',options:{minutes},style:{png64:SELECTED_DURATION_BORDER}}]}
    presets.temp_quiet={...button('臨時：保持安靜','保持\n安靜','temporary_show',{text:'請保持安靜',seconds:8}),category:'時間提醒',feedbacks:[{feedbackId:'temporary_visible',options:{},style:{bgcolor:'#cc2222',color:'#ffffff'}}]};presets.marquee={...button('跑馬燈顯示／取消','跑馬燈','marquee_toggle',{text:'活動即將開始',direction:'rtl'}),category:'時間提醒',feedbacks:[{feedbackId:'marquee_visible',options:{},style:{bgcolor:'#cc2222',color:'#ffffff'}}]};presets.hide_all={...button('隱藏全部提醒','隱藏\n提醒','reminder_hide_all'),category:'時間提醒'}
    for(const [key,label,action,feedback] of [['timed','定時提醒','reminder_toggle_timed','reminder_timed_enabled'],['temporary','臨時提醒','reminder_toggle_temporary','reminder_temporary_enabled'],['marquee_window','跑馬燈視窗','reminder_toggle_marquee','reminder_marquee_enabled'],['image_window','圖片視窗','reminder_toggle_image','reminder_image_enabled']])presets[`reminder_enable_${key}`]={...button(`啟用／停用${label}`,`${label}\n啟用`,action),category:'時間提醒',feedbacks:[{feedbackId:feedback,options:{},style:{bgcolor:'#cc2222',color:'#ffffff'}}]}
    return presets
  }
}
