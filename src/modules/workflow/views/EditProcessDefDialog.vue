<script setup lang="ts">
/**
 * EditProcessDefDialog — 编辑流程定义弹窗（最小单节点审批配置）。
 *
 * 编辑 DRAFT 状态流程定义的名称、表单标识，并按后端能力清单配置节点：
 * 默认 START → APPROVAL（指定审批人）→ END；p57-evidence 下可显式选择
 * P57_VERIFY 的 message 字段并组装 START → P57_VERIFY → END。保存时组装完整图数据并即时校验，
 * 发布门（后端 GraphValidator）据此通过，表单提交事件才能真实发起流程。
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
import type { BpmNodeCapability } from '@/contracts/bpm-node'
import {
  assertRequiredNodeCapabilities,
  findNodeCapability,
  getDesignableNodeCapabilities,
  NodeCapabilityContractError,
  REQUIRED_WORKFLOW_NODE_TYPES,
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

/** 单节点审批人（DESIGNATED，存用户 ID） */
const approverId = ref('')
/** 审批人下拉候选：pageUsers 返回的用户 */
const approverOptions = ref<Array<{ id: string; label: string }>>([])
const approverLoading = ref(false)
const validating = ref(false)
const saving = ref(false)
const nodeCapabilities = ref<BpmNodeCapability[]>([])
const capabilityLoading = ref(false)
const capabilityError = ref('')

const designableNodeCapabilities = computed(() =>
  getDesignableNodeCapabilities(nodeCapabilities.value),
)
const startCapability = computed(() =>
  findNodeCapability(designableNodeCapabilities.value, 'START'),
)
const verificationCapability = computed(() =>
  findNodeCapability(designableNodeCapabilities.value, 'P57_VERIFY'),
)
const endCapability = computed(() => findNodeCapability(designableNodeCapabilities.value, 'END'))
const middleNodeType = ref<WorkflowMiddleNodeType>('APPROVAL')
const verificationMode = computed(() => middleNodeType.value === 'P57_VERIFY')
const middleCapability = computed(() =>
  findNodeCapability(designableNodeCapabilities.value, middleNodeType.value),
)
const verificationMessage = ref('p57-real-app-observed')

watch(
  () => props.visible,
  (val) => {
    if (val && props.processDef) {
      form.value.name = props.processDef.name
      form.value.formKey = props.processDef.formKey
      approverId.value = ''
      middleNodeType.value = resolveWorkflowMiddleNodeType()
      verificationMessage.value = 'p57-real-app-observed'
      void loadNodeCapabilities()
      void loadApproverOptions()
      void loadExistingApprover()
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
      (el) => el.kind === 'node' && (el.type === 'APPROVAL' || el.type === 'P57_VERIFY'),
    )
    if (middleNode?.type === 'P57_VERIFY') {
      middleNodeType.value = resolveWorkflowMiddleNodeType(middleNode.type)
      const message = middleNode.config?.message
      if (typeof message === 'string' && message.trim()) {
        verificationMessage.value = message
      }
      return
    }
    middleNodeType.value = resolveWorkflowMiddleNodeType(middleNode?.type)
    const approvalNode = middleNode?.type === 'APPROVAL' ? middleNode : undefined
    const approver = approvalNode?.config?.approver as
      | { type?: string; value?: unknown }
      | undefined
    const value = approver?.value
    if (Array.isArray(value) && value.length > 0) {
      approverId.value = String(value[0])
    } else if (typeof value === 'string' && value) {
      approverId.value = value
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
  const middleConfig = verificationMode.value
    ? { message: verificationMessage.value.trim() }
    : {
        name: capability.displayName,
        approver: { type: 'DESIGNATED', value: [approverId.value] },
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
  if (capabilityLoading.value) {
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
  if (!verificationMode.value && !approverId.value) {
    ElMessage.warning('请选择审批人')
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
    const capabilityErrors = validateProcessGraphCapabilities(
      graph,
      nodeCapabilities.value,
      verificationMode.value ? ['START', 'P57_VERIFY', 'END'] : REQUIRED_WORKFLOW_NODE_TYPES,
    )
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
      <el-form-item :label="verificationMode ? '验证节点' : '审批节点'">
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
            v-if="verificationCapability"
            v-model="middleNodeType"
            :disabled="capabilityLoading || Boolean(capabilityError)"
            class="node-mode-select"
          >
            <el-radio value="APPROVAL">普通审批</el-radio>
            <el-radio value="P57_VERIFY">隔离验证</el-radio>
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
          <el-select
            v-else
            v-model="approverId"
            placeholder="选择审批人"
            :loading="approverLoading"
            :disabled="capabilityLoading || Boolean(capabilityError)"
            filterable
            class="approver-select"
          >
            <el-option
              v-for="opt in approverOptions"
              :key="opt.id"
              :label="opt.label"
              :value="opt.id"
            />
          </el-select>
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
