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
  /**
   * 用户 ID 列表。
   *
   * 服务端 ID 是 64 位雪花值，超出 JavaScript 安全整数范围（2^53-1）；用 `number`
   * 承载会被静默截断成另一个 ID，服务端因此解析不到接收人。这里按原值（字符串）
   * 透传，服务端 Jackson 直接绑定为 Long。
   */
  recipientUserIds?: Array<number | string>
  recipientDeptIds?: Array<number | string>
  recipientRoleCodes?: string[]
  title?: string
  content?: string
  templateCode?: string
  variables?: Record<string, string>
}

/** 批量发送逐项失败明细（安全结论，不含原始异常、栈、租户秘密或第三方原文）。 */
export interface NotifyBatchItemFailure {
  /** 接收对象引用：直接指定的用户 ID 原样回显 */
  recipientRef: string
  /** 稳定分类键：RECIPIENT_NOT_DELIVERABLE / CHANNEL_NOT_CONFIGURED / DELIVERY_TIMEOUT / DELIVERY_FAILED */
  category: string
  /** 稳定语义键；语言切换不改变其值，测试断言它而非文案 */
  errorKey: string
  /** 服务端按请求语言本地化的安全结论，页面直接展示 */
  message: string
}

/**
 * 批量发送响应。
 *
 * phase=SEND_RESULT 时四项计数满足 totalCount === successCount + failureCount + processingCount，
 * 由服务端一次判定得出，页面不按行数推算；phase=RESOLVE 是发送前投影，只有 recipientCount/totalCount 有意义。
 */
export interface NotifyBatchSendResp {
  /** 成功投递的接收人数（兼容字段，等于 successCount） */
  recipientCount: number
  /** RESOLVE = 发送前接收人投影；SEND_RESULT = 一次批量发送的实际结果 */
  phase?: string
  totalCount?: number
  successCount?: number
  failureCount?: number
  /** 同步原子契约下恒为 0；页面显式呈现该事实，不用 0 冒充未知 */
  processingCount?: number
  failures?: NotifyBatchItemFailure[]
}
