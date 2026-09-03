/**
 * BPM 节点能力契约。
 *
 * 这是流程设计器消费的稳定产品语义，不暴露 Flowable 或其他引擎对象。
 * 能力清单由后端统一注册结果提供；前端不得维护另一份节点目录。
 */

export type BpmNodeCategory = 'EVENT' | 'TASK' | 'GATEWAY' | 'OTHER'

export interface BpmNodeTopology {
  minIncoming: number
  maxIncoming: number | null
  minOutgoing: number
  maxOutgoing: number | null
}

/** 配置字段的约束保持为产品语义，具体字段值仍由节点能力声明。 */
export interface BpmNodeConfigField {
  key: string
  label: string
  type: string
  required: boolean
  validation?: Record<string, unknown>
}

export interface BpmNodeSupports {
  design: boolean
  save: boolean
  publish: boolean
  run: boolean
}

export interface BpmNodeCapability {
  /** 与 graph element.type 相同的稳定节点类型标识。 */
  type: string
  /** 面向设计器的显示名称与说明。 */
  displayName: string
  description: string
  category: BpmNodeCategory
  /** 能力实现/契约版本，由后端统一注册结果声明。 */
  version: string
  topology: BpmNodeTopology
  configFields: BpmNodeConfigField[]
  supports: BpmNodeSupports
}
