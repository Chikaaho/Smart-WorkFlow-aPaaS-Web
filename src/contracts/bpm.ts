// ─── 待办任务 DTO（对齐后端 TodoTaskRespDTO） ───
export interface TodoTask {
  taskId: string
  processInstanceId: string
  processName: string // 来自 BpmProcessDef.name，可为空字符串
  formKey: string
  businessKey: string
  createTime: string
}

// ─── 任务详情 DTO（对齐后端 TaskDetailRespDTO） ───
export interface TaskDetail {
  taskId: string
  taskName: string
  processInstanceId: string
  processDefinitionKey: string
  processName: string | null // 流程定义被删除时为 null
  formKey: string
  businessKey: string
  assignee: string
  assigneeName?: string | null // 审批人展示名（可读身份回显）
  initiatorId: number // 后端 Long → JSON number
  initiatorName?: string | null // 发起人展示名（可读身份回显）
  createTime: string // LocalDateTime → ISO-8601 string
  processVariables: Record<string, unknown> // Map<String, Object>
  approvalHistory: ApprovalHistoryItem[]
}

// ─── 审批历史项 DTO（对齐后端 ApprovalHistoryItemDTO） ───
export interface ApprovalHistoryItem {
  taskId: string
  taskName: string
  assignee: string
  assigneeName?: string | null // 审批人展示名（可读身份回显）
  createTime: string
  endTime: string | null // 可能为 null
  approvalResult: 'APPROVED' | 'REJECTED' | null // 审批结果：APPROVED=通过, REJECTED=驳回, null=进行中
}

// ─── 已办任务 DTO（对齐后端 ProcessedTaskRespDTO） ───
export interface ProcessedTask {
  taskId: string
  taskName: string
  processInstanceId: string
  processName: string | null // 流程定义被删除时为 null
  formKey: string
  businessKey: string
  createTime: string
  endTime: string | null // 极端历史数据可能为 null
}

// ─── 流程定义列表项 DTO（对齐后端 BpmProcessDef，不含 graph_json） ───
export interface ProcessDef {
  id: number
  processKey: string
  name: string
  formKey: string
  defVersion: number
  status: 'DRAFT' | 'PUBLISHED'
  createTime: string
  updateTime: string
}

// ─── 创建流程定义请求 DTO（对齐后端 CreateProcessDefRequest） ───
export interface CreateProcessDefReq {
  name: string
  formKey: string
}

// ─── 创建流程定义响应 DTO（对齐后端 CreateProcessDefResponse） ───
export interface CreateProcessDefResp {
  defId: number
  graph: unknown // ProcessGraph，设计器回显用
}

// ─── 流程实例列表项 DTO（对齐后端 InstanceListItemDTO） ───
export interface ProcessInstance {
  id: number // BpmInstance 主键 ID
  processInstanceId: string // Flowable 流程实例 ID
  processDefKey: string // BPMN 流程定义 key
  processName: string | null // 流程名称（经后端 processDefService 富化，流程定义被删除时为 null）
  businessKey: string // 业务键（= 表单 recordId）
  formKey: string // 表单业务标识
  initiatorId: number // 发起人用户 ID（后端 Long → JSON number）
  initiatorName?: string | null // 发起人展示名（可读身份回显）
  status: 'RUNNING' | 'APPROVED' | 'REJECTED' // 实例状态
  createTime: string // 发起时间（LocalDateTime → ISO-8601 string）
}

// ─── 活动节点 DTO（对齐后端 BpmActivityDTO） ───
export interface ActivityNode {
  activityId: string // BPMN 元素 ID（如 "Activity_001"，与 bpmn-js bpmnElement 对齐）
  activityName: string // 节点名称（如 "经理审批"）
  activityType: string // 节点类型：userTask / startEvent / endEvent / exclusiveGateway 等
  startTime: string | null // 开始时间（未开始节点可能为 null）
  endTime: string | null // 结束时间（进行中节点为 null）
  assignee: string | null // 处理人（仅 userTask 有值）
  assigneeName?: string | null // 处理人展示名（可读身份回显）
  taskId: string | null // Flowable task ID（仅 userTask 有值）
}

// ─── 流程实例详情 DTO（对齐后端 InstanceDetailDTO） ───
export interface InstanceDetail extends ProcessInstance {
  activeNodeIds: string[] // 当前活跃节点 activity ID 列表（流程图绿色高亮）。实例已结束时为空
  flowTrace: ActivityNode[] // 全部历史活动节点（按结束时间升序，进行中节点排末尾）
}
