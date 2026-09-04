<script setup lang="ts">
/**
 * EditProcessDefDialog — 编辑流程定义弹窗（P58 节点能力配置入口）。
 *
 * 编辑 DRAFT 状态流程定义的名称、表单标识，并按后端能力清单配置节点：
 * 默认 START → APPROVAL（指定审批人）→ END；其余中间节点按能力清单动态呈现。
 * 保存时组装完整图数据并即时校验，发布门（后端 GraphValidator）据此通过，
 * 表单提交事件才能真实发起流程。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  saveProcessDefGraph,
  getProcessDefDefinition,
  getProcessNodeCapabilities,
  validateProcessDefGraph,
  queryApproverCandidates,
} from '@/modules/workflow/api'
import type { ProcessGraphPayload } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessDef } from '@/contracts/bpm'
import type { BpmNodeCapability, ParticipantStrategy } from '@/contracts/bpm-node'
import {
  assertRequiredNodeCapabilities,
  findNodeCapability,
  getDesignableNodeCapabilities,
  NodeCapabilityContractError,
  resolveWorkflowMiddleNodeType,
  validateProcessGraphCapabilities,
} from '@/modules/workflow/utils/node-capabilities'
import type { WorkflowMiddleNodeType } from '@/modules/workflow/utils/node-capabilities'

const props = defineProps<{
  visible: boolean
  processDef: ProcessDef | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const form = ref({
  name: '',
  formKey: '',
})

/** 统一参与人配置；固定用户可多选，其余策略使用结构化字符串值。 */
const participantStrategy = ref<ParticipantStrategy>('FIXED_USER')
const participantIds = ref<string[]>([])
const participantValue = ref('')
const consensusMode = ref<'ALL' | 'ANY' | 'RATIO'>('ALL')
const consensusRatio = ref(100)
const notificationChannel = ref('IN_APP')
const notificationTitle = ref('流程节点通知')
const notificationContent = ref('请查看流程节点消息')
const branchExpression = ref('form.amount > 0')
/** 审批人下拉候选：pageUsers 返回的用户 */
const approverOptions = ref<Array<{ id: string; label: string }>>([])
const approverLoading = ref(false)
const validating = ref(false)
const saving = ref(false)
const nodeCapabilities = ref<BpmNodeCapability[]>([])
const capabilityLoading = ref(false)
const capabilityError = ref('')
const initializing = ref(false)

const designableNodeCapabilities = computed(() =>
  getDesignableNodeCapabilities(nodeCapabilities.value),
)
const startCapability = computed(() =>
  findNodeCapability(designableNodeCapabilities.value, 'START'),
)
const endCapability = computed(() => findNodeCapability(designableNodeCapabilities.value, 'END'))
const middleNodeType = ref<WorkflowMiddleNodeType>('APPROVAL')
const verificationMode = computed(() => middleNodeType.value === 'P57_VERIFY')
const participantNode = computed(() =>
  ['APPROVAL', 'CONSENSUS', 'COPY', 'NOTIFICATION'].includes(middleNodeType.value),
)
const conditionNode = computed(() => middleNodeType.value === 'CONDITION')
const middleCapability = computed(() =>
  findNodeCapability(designableNodeCapabilities.value, middleNodeType.value),
)
const verificationMessage = ref('')

watch(
  () => props.visible,
  async (val) => {
    if (val && props.processDef) {
      initializing.value = true
      form.value.name = props.processDef.name
      form.value.formKey = props.processDef.formKey
      participantIds.value = []
      participantValue.value = ''
      participantStrategy.value = 'FIXED_USER'
      consensusMode.value = 'ALL'
      consensusRatio.value = 100
      notificationChannel.value = 'IN_APP'
      middleNodeType.value = resolveWorkflowMiddleNodeType()
      verificationMessage.value = ''
      try {
        await Promise.all([loadNodeCapabilities(), loadApproverOptions(), loadExistingApprover()])
      } finally {
        initializing.value = false
      }
    }
  },
)

/** 节点目录是编辑器的运行时契约；加载或解析失败时禁止保存。 */
async function loadNodeCapabilities() {
  capabilityLoading.value = true
  capabilityError.value = ''
  nodeCapabilities.value = []
  try {
    const capabilities = await getProcessNodeCapabilities()
    assertRequiredNodeCapabilities(capabilities)
    nodeCapabilities.value = capabilities
  } catch (err) {
    nodeCapabilities.value = []
    capabilityError.value =
      err instanceof NodeCapabilityContractError ? err.message : '节点能力清单加载失败，请稍后重试'
    ElMessage.error(capabilityError.value)
  } finally {
    capabilityLoading.value = false
  }
}

/** 加载审批人候选（真实用户列表，经 BPM 防腐接口） */
async function loadApproverOptions() {
  approverLoading.value = true
  try {
    const candidates = await queryApproverCandidates('')
    approverOptions.value = candidates.map((u) => ({
      id: String(u.id),
      label: `${u.realName || u.username}（${u.username}）`,
    }))
  } catch {
    // 候选加载失败不阻塞弹窗，保存时仍会校验审批人必选
    approverOptions.value = []
  } finally {
    approverLoading.value = false
  }
}

/** 从已保存图数据回显中间节点配置（若有）。 */
async function loadExistingApprover() {
  if (!props.processDef) return
  try {
    const graph = await getProcessDefDefinition(props.processDef.id)
    const middleNode = (graph.elements ?? []).find(
      (el) => el.kind === 'node' && el.type !== 'START' && el.type !== 'END',
    )
    if (middleNode?.type === 'P57_VERIFY') {
      middleNodeType.value = resolveWorkflowMiddleNodeType(middleNode.type)
      const message = middleNode.config?.message
      if (typeof message === 'string' && message.trim()) {
        verificationMessage.value = message
      }
      return
    }
    if (!middleNode) return
    middleNodeType.value = resolveWorkflowMiddleNodeType(middleNode.type)
    if (['APPROVAL', 'CONSENSUS', 'COPY', 'NOTIFICATION'].includes(middleNode.type ?? '')) {
      const participant = middleNode.config?.participant ?? middleNode.config?.approver
      if (participant && typeof participant === 'object' && !Array.isArray(participant)) {
        const config = participant as { strategy?: string; type?: string; value?: unknown }
        participantStrategy.value =
          config.strategy === 'ROLE' ||
          config.strategy === 'EXPRESSION' ||
          config.strategy === 'ADAPTER'
            ? config.strategy
            : 'FIXED_USER'
        const value = config.value
        if (participantStrategy.value === 'FIXED_USER') {
          participantIds.value = Array.isArray(value)
            ? value.map(String)
            : value
              ? [String(value)]
              : []
          participantValue.value = ''
        } else {
          participantIds.value = []
          participantValue.value = typeof value === 'string' ? value : ''
        }
      }
      const mode = middleNode.config?.mode
      if (mode === 'ALL' || mode === 'ANY' || mode === 'RATIO') consensusMode.value = mode
      if (typeof middleNode.config?.ratio === 'number')
        consensusRatio.value = middleNode.config.ratio
      if (typeof middleNode.config?.channel === 'string')
        notificationChannel.value = middleNode.config.channel
    }
  } catch {
    // 草稿无图或不可达时保持空，由用户重新配置
  }
}

/** 按当前选择和能力清单组装最小流程图。 */
function buildGraph(): ProcessGraphPayload {
  if (!props.processDef) throw new Error('processDef missing')
  const capability = middleCapability.value
  if (!capability) {
    throw new NodeCapabilityContractError(`节点能力不可用：${middleNodeType.value}`)
  }
  const middleType = middleNodeType.value
  const participant = {
    strategy: participantStrategy.value,
    value:
      participantStrategy.value === 'FIXED_USER'
        ? participantIds.value
        : participantValue.value.trim(),
    ...(participantStrategy.value === 'ADAPTER'
      ? { adapterId: participantValue.value.trim() }
      : {}),
  }
  const middleConfig = verificationMode.value
    ? { message: verificationMessage.value.trim() }
    : participantNode.value
      ? {
          name: capability.displayName,
          participant,
          ...(middleType === 'APPROVAL'
            ? {
                opinionForm: {
                  formId: 'DEFAULT_REMARK',
                  version: '1',
                  fields: [{ key: 'comment', label: '备注', type: 'TEXTAREA', required: false }],
                },
                returnTargets: [],
              }
            : {}),
          ...(middleType === 'CONSENSUS'
            ? { mode: consensusMode.value, ratio: consensusRatio.value }
            : {}),
          ...(middleType === 'NOTIFICATION'
            ? {
                channel: notificationChannel.value,
                title: notificationTitle.value.trim(),
                content: notificationContent.value.trim(),
                failureStrategy: 'BLOCK',
              }
            : {}),
        }
      : { name: capability.displayName, branchExpression: branchExpression.value.trim() }
  if (conditionNode.value) {
    const pathConfig = {
      participant,
      channel: 'IN_APP',
      title: '条件分支命中',
      content: '条件分支已命中',
    }
    return {
      processKey: props.processDef.processKey,
      name: form.value.name,
      formKey: form.value.formKey,
      elements: [
        { id: 'node_start', kind: 'node', type: 'START', config: {}, style: { x: 100, y: 300 } },
        {
          id: 'node_middle',
          kind: 'node',
          type: 'CONDITION',
          config: middleConfig,
          style: { x: 350, y: 300 },
        },
        {
          id: 'node_true',
          kind: 'node',
          type: 'NOTIFICATION',
          config: pathConfig,
          style: { x: 600, y: 220 },
        },
        {
          id: 'node_default',
          kind: 'node',
          type: 'NOTIFICATION',
          config: pathConfig,
          style: { x: 600, y: 380 },
        },
        { id: 'node_end', kind: 'node', type: 'END', config: {}, style: { x: 850, y: 300 } },
        {
          id: 'edge_1',
          kind: 'edge',
          source: 'node_start',
          target: 'node_middle',
          config: {},
          style: {},
        },
        {
          id: 'edge_true',
          kind: 'edge',
          source: 'node_middle',
          target: 'node_true',
          config: { branchId: 'TRUE', priority: 1, expression: branchExpression.value.trim() },
          style: {},
        },
        {
          id: 'edge_default',
          kind: 'edge',
          source: 'node_middle',
          target: 'node_default',
          config: { branchId: 'DEFAULT', default: true },
          style: {},
        },
        {
          id: 'edge_true_end',
          kind: 'edge',
          source: 'node_true',
          target: 'node_end',
          config: {},
          style: {},
        },
        {
          id: 'edge_default_end',
          kind: 'edge',
          source: 'node_default',
          target: 'node_end',
          config: {},
          style: {},
        },
      ],
      canvas: {},
    }
  }
  return {
    processKey: props.processDef.processKey,
    name: form.value.name,
    formKey: form.value.formKey,
    elements: [
      { id: 'node_start', kind: 'node', type: 'START', config: {}, style: { x: 100, y: 300 } },
      {
        id: 'node_middle',
        kind: 'node',
        type: middleType,
        config: middleConfig,
        style: { x: 400, y: 300 },
      },
      { id: 'node_end', kind: 'node', type: 'END', config: {}, style: { x: 700, y: 300 } },
      {
        id: 'edge_1',
        kind: 'edge',
        source: 'node_start',
        target: 'node_middle',
        config: {},
        style: {},
      },
      {
        id: 'edge_2',
        kind: 'edge',
        source: 'node_middle',
        target: 'node_end',
        config: {},
        style: {},
      },
    ],
    canvas: {},
  }
}

function handleClose() {
  emit('update:visible', false)
}

async function handleSave() {
  if (initializing.value || capabilityLoading.value) {
    ElMessage.warning('节点能力清单加载中，请稍候')
    return
  }
  if (capabilityError.value || nodeCapabilities.value.length === 0) {
    ElMessage.error(capabilityError.value || '节点能力清单不可用，无法保存')
    return
  }
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入流程名称')
    return
  }
  if (!form.value.formKey.trim()) {
    ElMessage.warning('请输入表单标识')
    return
  }
  if (
    participantNode.value &&
    participantStrategy.value === 'FIXED_USER' &&
    participantIds.value.length === 0
  ) {
    ElMessage.warning('请选择参与人')
    return
  }
  if (
    participantNode.value &&
    participantStrategy.value !== 'FIXED_USER' &&
    !participantValue.value.trim()
  ) {
    ElMessage.warning('请输入参与人策略值')
    return
  }
  if (
    middleNodeType.value === 'CONSENSUS' &&
    (consensusRatio.value < 1 || consensusRatio.value > 100)
  ) {
    ElMessage.warning('通过比例必须在 1% 到 100% 之间')
    return
  }
  if (
    middleNodeType.value === 'NOTIFICATION' &&
    (!notificationTitle.value.trim() || !notificationContent.value.trim())
  ) {
    ElMessage.warning('请输入通知标题和正文')
    return
  }
  if (verificationMode.value && !verificationMessage.value.trim()) {
    ElMessage.warning('请输入验证消息')
    return
  }
  if (!props.processDef) return

  saving.value = true
  try {
    const graph = buildGraph()
    const capabilityErrors = validateProcessGraphCapabilities(graph, nodeCapabilities.value, [
      'START',
      middleNodeType.value,
      'END',
    ])
    if (capabilityErrors.length > 0) {
      ElMessage.error(`节点能力校验未通过：${capabilityErrors[0]}`)
      return
    }
    await saveProcessDefGraph(props.processDef.id, graph)
    // 保存后即时校验，把发布门的图校验前移，避免发布时才暴露拓扑/配置错误
    validating.value = true
    let errors: Awaited<ReturnType<typeof validateProcessDefGraph>> = []
    try {
      errors = await validateProcessDefGraph(props.processDef.id)
    } finally {
      validating.value = false
    }
    if (errors.length > 0) {
      ElMessage.error(`图校验未通过：${errors[0]?.message ?? '未知错误'}`)
      return
    }
    ElMessage.success('保存成功，图校验通过')
    emit('saved')
    handleClose()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('保存失败')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="编辑流程定义"
    width="520px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form label-width="100px">
      <el-form-item label="流程名称">
        <el-input v-model="form.name" placeholder="请输入流程名称" />
      </el-form-item>
      <el-form-item label="表单标识">
        <el-input v-model="form.formKey" placeholder="请输入表单标识" :disabled="true" />
      </el-form-item>
      <el-form-item :label="verificationMode ? '验证节点' : '中间节点'">
        <div class="approval-config">
          <el-alert
            v-if="capabilityError"
            :title="capabilityError"
            type="error"
            :closable="false"
            show-icon
            class="capability-error"
          />
          <el-radio-group
            v-if="designableNodeCapabilities.length > 0"
            v-model="middleNodeType"
            :disabled="capabilityLoading || Boolean(capabilityError)"
            class="node-mode-select"
          >
            <el-radio
              v-for="item in designableNodeCapabilities.filter(
                (capability) => !['START', 'END'].includes(capability.type),
              )"
              :key="item.type"
              :value="item.type"
            >
              {{ item.displayName }}
            </el-radio>
          </el-radio-group>
          <div class="approval-flow">
            <el-tag>{{ startCapability?.displayName ?? '节点能力缺失' }}</el-tag>
            <span class="arrow">→</span>
            <el-tag type="warning">{{ middleCapability?.displayName ?? '节点能力缺失' }}</el-tag>
            <span class="arrow">→</span>
            <el-tag type="success">{{ endCapability?.displayName ?? '节点能力缺失' }}</el-tag>
          </div>
          <el-input
            v-if="verificationMode"
            v-model="verificationMessage"
            placeholder="请输入验证消息"
            :disabled="capabilityLoading || Boolean(capabilityError)"
            class="approver-select"
          />
          <template v-else-if="participantNode">
            <el-select
              v-model="participantStrategy"
              class="strategy-select"
              :disabled="initializing || capabilityLoading || Boolean(capabilityError)"
            >
              <el-option label="固定用户" value="FIXED_USER" />
              <el-option label="角色" value="ROLE" />
              <el-option label="流程表达式" value="EXPRESSION" />
              <el-option label="后端适配器" value="ADAPTER" />
            </el-select>
            <el-select
              v-if="participantStrategy === 'FIXED_USER'"
              v-model="participantIds"
              placeholder="选择参与人（可多选）"
              :loading="approverLoading"
              :disabled="initializing || capabilityLoading || Boolean(capabilityError)"
              filterable
              multiple
              collapse-tags
              class="approver-select"
            >
              <el-option
                v-for="opt in approverOptions"
                :key="opt.id"
                :label="opt.label"
                :value="opt.id"
              />
            </el-select>
            <el-input
              v-else
              v-model="participantValue"
              :placeholder="
                participantStrategy === 'ROLE'
                  ? '角色编码'
                  : participantStrategy === 'EXPRESSION'
                    ? '例如 form.ownerId'
                    : '适配器标识'
              "
              :disabled="initializing || capabilityLoading || Boolean(capabilityError)"
              class="approver-select"
            />
          </template>
          <template v-if="middleNodeType === 'CONSENSUS'">
            <el-select v-model="consensusMode" class="approver-select">
              <el-option label="全部通过（ALL）" value="ALL" />
              <el-option label="任一通过（ANY）" value="ANY" />
              <el-option label="按比例通过（RATIO）" value="RATIO" />
            </el-select>
            <el-input-number
              v-if="consensusMode === 'RATIO'"
              v-model="consensusRatio"
              :min="1"
              :max="100"
              class="approver-select"
            />
          </template>
          <template v-if="middleNodeType === 'NOTIFICATION'">
            <el-select v-model="notificationChannel" class="approver-select">
              <el-option label="站内信" value="IN_APP" />
              <el-option label="短信（SPI 预留）" value="SMS" />
              <el-option label="飞书（SPI 预留）" value="FEISHU" />
              <el-option label="钉钉（SPI 预留）" value="DINGTALK" />
              <el-option label="企业微信（SPI 预留）" value="WECHAT_WORK" />
              <el-option label="公众号（SPI 预留）" value="WECHAT_OFFICIAL" />
              <el-option label="小程序（SPI 预留）" value="WECHAT_MINI_PROGRAM" />
            </el-select>
            <el-input v-model="notificationTitle" placeholder="通知标题" class="approver-select" />
            <el-input
              v-model="notificationContent"
              type="textarea"
              :rows="2"
              placeholder="通知正文"
              class="approver-select"
            />
          </template>
          <el-input
            v-if="middleNodeType === 'CONDITION'"
            v-model="branchExpression"
            placeholder="条件表达式，例如 form.amount > 0"
            class="approver-select"
          />
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="saving || validating || capabilityLoading"
        :disabled="Boolean(capabilityError)"
        @click="handleSave"
      >
        保存并校验
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.approval-config {
  width: 100%;
}
.approval-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.node-mode-select {
  display: block;
  margin-bottom: 8px;
}
.strategy-select {
  width: 100%;
  margin-bottom: 8px;
}
.capability-error {
  margin-bottom: 8px;
}
.arrow {
  color: var(--el-text-color-secondary);
}
.approver-select {
  width: 100%;
}
</style>
