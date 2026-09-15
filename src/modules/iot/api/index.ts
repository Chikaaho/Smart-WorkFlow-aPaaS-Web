import { request } from '@/foundation/request'

// ═══════════════════════════════════════
// P21 IoT 平台：连接 / 产品物模型 / 设备 / Topic / 脚本 / 规则 / 运行记录
// ═══════════════════════════════════════

/** 通用后端实体（8 基列 + 业务列） */
export interface IotBase {
  id: number
  createTime: string
  updateTime: string
  tenantId: number
}

export interface IotConnection extends IotBase {
  code: string
  name: string
  connType: 'TENCENT' | 'MQTT'
  enabled: number
  healthStatus: string
  lastCheckTime: string | null
  lastCheckResult: string | null
  host: string | null
  port: number | null
  useTls: number
  username: string | null
  passwordMasked?: string
  hasPassword?: boolean
  keepalive: number
  cleanSession: number
  region?: string | null
  endpoint?: string | null
}

export interface IotProduct extends IotBase {
  code: string
  name: string
  connId: number | null
  connType: string
  modelStatus: 'DRAFT' | 'PUBLISHED'
  publishedModelId: number | null
  description: string | null
}

export interface IotThingModel extends IotBase {
  productId: number
  modelVersion: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  contentJson: string | null
  publishTime: string | null
}

export interface IotDevice extends IotBase {
  deviceKey: string
  name: string
  deviceType: string | null
  status: string
  productId: string | null
  deviceName: string | null
  connectionId: number | null
  productRefId: number | null
  manageStatus: 'DRAFT' | 'PUBLISHED' | 'DISABLED' | 'RETIRED'
  processAccessEnabled: number
  lastReportTime: string | null
  lastCommandTime: string | null
  labels: string | null
}

export interface IotTopic extends IotBase {
  connId: number
  productId: number | null
  topic: string
  direction: 'UP' | 'DOWN' | 'BOTH'
  qos: number
  retain: number
  payloadType: 'PROPERTY' | 'EVENT' | 'ACTION_RESULT' | 'RAW'
  mappingJson: string | null
  enabled: number
  remark: string | null
}

export interface IotScript extends IotBase {
  code: string
  name: string
  language: 'JS' | 'JAVA'
  triggerType: 'MESSAGE' | 'EVENT' | 'RULE' | 'MANUAL'
  bindingJson: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  currentVersion: number
  publishedVersion: number | null
  timeoutMs: number
}

export interface IotScriptExec extends IotBase {
  scriptId: number
  scriptVersion: number
  triggerSource: string | null
  triggerRef: string | null
  status: string
  outputJson: string | null
  error: string | null
  durationMs: number | null
  sideEffect: number
  correlationId: string | null
}

export interface IotEventRule extends IotBase {
  code: string
  name: string
  deviceId: number
  ruleType: 'PROPERTY_CHANGED' | 'THRESHOLD' | 'EVENT_OCCUR' | 'ONLINE' | 'OFFLINE'
  conditionJson: string
  debounceMs: number
  cooldownMs: number
  continuousCount: number
  processTemplateKey: string | null
  formMappingJson: string | null
  processEnabled: number
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  ruleVersion: number
  lastFiredTime: string | null
}

export interface IotMessageLog extends IotBase {
  connId: number | null
  deviceId: number | null
  topic: string | null
  direction: string
  dedupKey: string | null
  payload: string | null
  payloadType: string | null
  parseStatus: string
  parseError: string | null
  qos: number
}

export interface IotCommandRecord extends IotBase {
  deviceId: number
  provider: string
  capabilityType: string
  capabilityId: string | null
  paramsJson: string | null
  status: string
  error: string | null
  sourceType: string
  flowInstanceId: string | null
  correlationId: string | null
}

export interface IotProcessTriggerRecord extends IotBase {
  ruleId: number | null
  deviceId: number | null
  idempotentKey: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  processInstanceId: string | null
  formSnapshot: string | null
  error: string | null
  triggerTime: string
}

function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qp: Record<string, string> = {}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qp[k] = String(v)
    }
  }
  return request<T>({ method: 'GET', url, params: qp })
}

function post<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ method: 'POST', url, data })
}

// ─── 连接配置 ───

export function listConnections(): Promise<IotConnection[]> {
  return get<IotConnection[]>('/iot/connections')
}
export function createConnection(body: Record<string, unknown>): Promise<IotConnection> {
  return post<IotConnection>('/iot/connections', body)
}
export function updateConnection(
  id: number,
  body: Record<string, unknown>,
): Promise<IotConnection> {
  return request<IotConnection>({ method: 'PUT', url: `/iot/connections/${id}`, data: body })
}
export function testConnection(id: number): Promise<{ category: string; detail: string }> {
  return post<{ category: string; detail: string }>(`/iot/connections/${id}/test`)
}
export function connectConnection(
  id: number,
): Promise<{ connected: boolean; subscriptions: number }> {
  return post(`/iot/connections/${id}/connect`)
}
export function rotateConnectionPassword(id: number, password: string): Promise<void> {
  return post<void>(`/iot/connections/${id}/rotate`, { password })
}
export function toggleConnection(id: number, enabled: boolean): Promise<void> {
  return post<void>(`/iot/connections/${id}/enabled/${enabled}`)
}
export function deleteConnection(id: number): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/iot/connections/${id}` })
}

// ─── 产品 / 物模型 ───

export function listProducts(): Promise<IotProduct[]> {
  return get<IotProduct[]>('/iot/products')
}
export function createProduct(body: Record<string, unknown>): Promise<IotProduct> {
  return post<IotProduct>('/iot/products', body)
}
export function listThingModels(productId: number): Promise<IotThingModel[]> {
  return get<IotThingModel[]>(`/iot/products/${productId}/models`)
}
export function saveThingModelDraft(productId: number, model: unknown): Promise<IotThingModel> {
  return post<IotThingModel>(`/iot/products/${productId}/models`, { model })
}
export function publishThingModel(productId: number): Promise<IotThingModel> {
  return post<IotThingModel>(`/iot/products/${productId}/models/publish`)
}

// ─── 设备 ───

export function createDevice(body: Record<string, unknown>): Promise<IotDevice> {
  return post<IotDevice>('/iot/device-manage', body)
}
export function publishDevice(id: number): Promise<IotDevice> {
  return post<IotDevice>(`/iot/device-manage/${id}/publish`)
}
export function changeDeviceStatus(id: number, status: string): Promise<IotDevice> {
  return post<IotDevice>(`/iot/device-manage/${id}/status/${status}`)
}
export function changeDeviceProcessAccess(id: number, enabled: boolean): Promise<IotDevice> {
  return post<IotDevice>(`/iot/device-manage/${id}/process-access/${enabled}`)
}
export function refreshDeviceStatus(id: number): Promise<string> {
  return post<string>(`/iot/device-manage/${id}/refresh-status`)
}
export function listEligibleDevices(): Promise<IotDevice[]> {
  return get<IotDevice[]>('/iot/products/devices/eligible')
}

// ─── Topic ───

export function listTopics(): Promise<IotTopic[]> {
  return get<IotTopic[]>('/iot/topics')
}
export function createTopic(body: Record<string, unknown>): Promise<IotTopic> {
  return post<IotTopic>('/iot/topics', body)
}
export function updateTopic(id: number, body: Record<string, unknown>): Promise<IotTopic> {
  return request<IotTopic>({ method: 'PUT', url: `/iot/topics/${id}`, data: body })
}
export function toggleTopic(id: number, enabled: boolean): Promise<void> {
  return post<void>(`/iot/topics/${id}/enabled/${enabled}`)
}
export function deleteTopic(id: number): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/iot/topics/${id}` })
}

// ─── 脚本 ───

export function listScripts(): Promise<IotScript[]> {
  return get<IotScript[]>('/iot/scripts')
}
export function createScript(body: Record<string, unknown>): Promise<IotScript> {
  return post<IotScript>('/iot/scripts', body)
}
export function updateScriptDraft(id: number, body: Record<string, unknown>): Promise<IotScript> {
  return request<IotScript>({ method: 'PUT', url: `/iot/scripts/${id}`, data: body })
}
export function validateScript(id: number): Promise<{ status: string; error?: string }> {
  return post(`/iot/scripts/${id}/validate`)
}
export function dryRunScript(id: number, input: Record<string, unknown>): Promise<IotScriptExec> {
  return post<IotScriptExec>(`/iot/scripts/${id}/dry-run`, input)
}
export function publishScript(id: number): Promise<IotScript> {
  return post<IotScript>(`/iot/scripts/${id}/publish`)
}
export function disableScript(id: number): Promise<void> {
  return post<void>(`/iot/scripts/${id}/disable`)
}
export function listScriptExecs(scriptId?: number): Promise<IotScriptExec[]> {
  return get<IotScriptExec[]>('/iot/runtime/script-execs', { scriptId })
}

// ─── 事件规则 ───

export function listRules(deviceId?: number): Promise<IotEventRule[]> {
  return get<IotEventRule[]>('/iot/rules', { deviceId })
}
export function createRule(body: Record<string, unknown>): Promise<IotEventRule> {
  return post<IotEventRule>('/iot/rules', body)
}
export function publishRule(id: number): Promise<IotEventRule> {
  return post<IotEventRule>(`/iot/rules/${id}/publish`)
}
export function disableRule(id: number): Promise<IotEventRule> {
  return post<IotEventRule>(`/iot/rules/${id}/disable`)
}
export function listRuleTriggers(id: number): Promise<IotProcessTriggerRecord[]> {
  return get<IotProcessTriggerRecord[]>(`/iot/rules/${id}/triggers`)
}

// ─── 流程设备动作（A6/G2a） ───

export interface ProcessDefRow {
  id: number
  processKey: string
  name: string
  status: string
  formKey: string | null
  iotAccessEnabled?: boolean
  iotDeviceActionJson?: string | null
}

export function listProcessDefs(): Promise<ProcessDefRow[]> {
  return request<{ records: ProcessDefRow[] }>({
    method: 'GET',
    url: '/workflow/defs',
    params: { pageNum: '1', pageSize: '50' },
  }).then((page) => page.records)
}

export function saveFlowDeviceAction(
  id: number,
  action: Record<string, unknown>,
): Promise<ProcessDefRow> {
  return request<ProcessDefRow>({
    method: 'POST',
    url: `/workflow/defs/${id}/iot-device-action`,
    data: { action },
  })
}

// ─── 运行记录 ───

export function listMessages(params?: {
  deviceId?: number
  parseStatus?: string
}): Promise<IotMessageLog[]> {
  return get<IotMessageLog[]>('/iot/runtime/messages', params)
}
export function listCommands(params?: {
  deviceId?: number
  sourceType?: string
}): Promise<IotCommandRecord[]> {
  return get<IotCommandRecord[]>('/iot/runtime/commands', params)
}
export function retryCommand(id: number): Promise<IotCommandRecord> {
  return post<IotCommandRecord>(`/iot/runtime/commands/${id}/retry`)
}

export function listProcessTriggers(ruleId?: number): Promise<IotProcessTriggerRecord[]> {
  return get<IotProcessTriggerRecord[]>('/iot/runtime/process-triggers', { ruleId })
}
