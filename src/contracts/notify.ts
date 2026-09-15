// ─── 通知消息 DTO（对齐后端 NotifyMessage） ───
export interface NotifyMessage {
  id: number
  recipientId: number
  title: string
  content: string
  bizType: 'WF_TODO' | 'WF_APPROVED' | 'WF_REJECTED' | 'WF_RETURNED' | 'SYSTEM'
  bizId: string | null
  read: boolean
  createTime: string
  updateTime: string
  createBy: number | null
  updateBy: number | null
  tenantId: number
  /* I6 扩展 */
  channel?: string
  deliveryStatus?: string
  eventType?: string
  occurrenceNo?: number
  templateId?: number | null
  templateVersion?: number | null
  linkType?: string | null
  linkId?: string | null
}

// ─── I6 通知规则 / 渠道状态 / 订阅偏好 ───
export interface NotifyRule {
  id: number
  ruleCode: string
  name: string
  eventType: string
  channelPriority: string
  recipientRule: string
  requiredFlag: boolean
  failurePolicy: 'RETRY' | 'MANUAL'
  enabled: boolean
  remark: string | null
}
export interface NotifyRuleSaveReq {
  ruleCode: string
  name: string
  eventType: string
  channelPriority: string
  recipientRule: string
  requiredFlag: boolean
  failurePolicy: 'RETRY' | 'MANUAL'
  enabled: boolean
  remark?: string
}
export interface NotifyChannelStatus {
  channel: string
  systemConfigured: boolean
  tenantEnabled: boolean
  senderDisplay: string | null
  configSummary: string | null
}
export interface NotifySubscriptionItem {
  eventType: string
  channel: string
  enabled: boolean
}

// ─── 消息模板 DTO（对齐后端 NotifyTemplate，P36/M05-F02-01） ───
export interface NotifyTemplate {
  id: number
  templateCode: string
  name: string
  titleTemplate: string
  contentTemplate: string
  enabled: boolean
  remark: string | null
  createTime?: string
  updateTime?: string
}

/** 新建/编辑请求（编辑时 templateCode 不可变更） */
export interface NotifyTemplateSaveReq {
  templateCode: string
  name: string
  titleTemplate: string
  contentTemplate: string
  enabled: boolean
  remark?: string
  /* I6 */
  eventType?: string
  channel?: string
  variablesAllowed?: string
  jumpRef?: string
}

/** 预览请求：模板内容 + 变量值 */
export interface TemplatePreviewReq {
  titleTemplate: string
  contentTemplate: string
  variables: Record<string, string>
}

/** 预览结果：渲染后标题与正文 */
export interface TemplatePreviewResult {
  title: string
  content: string
}

// ─── 批量发送（对齐后端 NotifyBatchSendReq / NotifyBatchSendResp） ───

/** 批量发送请求（direct 模式与 template 模式互斥）。 */
export interface NotifyBatchSendReq {
  recipientUserIds?: number[]
  recipientDeptIds?: number[]
  recipientRoleCodes?: string[]
  title?: string
  content?: string
  templateCode?: string
  variables?: Record<string, string>
}

/** 批量发送响应（返回去重后的实际接收人数量）。 */
export interface NotifyBatchSendResp {
  recipientCount: number
}
