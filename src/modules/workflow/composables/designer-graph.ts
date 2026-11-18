import type { ProcessGraphDocument } from '@/contracts/process-graph'
import type { BpmVariableDef, TriggerConfig } from '@/contracts/p64'
import type { ProcessNotificationConfigPayload } from '@/modules/workflow/api'

/**
 * 设计器图文档 + 定义级展示元数据（formName/formDefId 节点13 advancedConfig，均由下发 payload 承载）。
 * （自 ProcessDesigner.vue 原地迁出，供主文件与各拆分模块共用。）
 */
export type DesignerGraph = ProcessGraphDocument & {
  formName?: string
  formDefId?: string
  advancedConfig?: GraphAdvancedConfig
  /** P64 阶段Ⅰ：BPM 变量与触发器（文档级；随图保存/发布冻结）。 */
  variables?: BpmVariableDef[]
  triggers?: TriggerConfig[]
  /** 50:88 结束通知：设计器不编辑，但保存/发布必须原样保留。 */
  notification?: ProcessNotificationConfigPayload | null
}

/** 高级配置元数据（定义 payload 的 advancedConfig 扩展；缺省展示占位符）。 */
export interface GraphAdvancedConfig {
  startListener?: string
  completeListener?: string
  notifyTargets?: string
  notifyChannels?: string[]
  notifyTemplate?: string
  preMode?: string
  preHandler?: string
  prePurpose?: string
  preFailure?: string
  postMode?: string
  postHandler?: string
  postPurpose?: string
  postFailure?: string
}
