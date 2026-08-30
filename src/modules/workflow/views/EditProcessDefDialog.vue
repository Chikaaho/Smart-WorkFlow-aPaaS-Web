<script setup lang="ts">
/**
 * EditProcessDefDialog — 编辑流程定义弹窗（最小单节点审批配置）。
 *
 * 编辑 DRAFT 状态流程定义的名称、表单标识，并配置唯一审批节点：
 * START → APPROVAL（指定审批人）→ END。保存时组装完整图数据并即时校验，
 * 发布门（后端 GraphValidator）据此通过，表单提交事件才能真实发起流程。
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  saveProcessDefGraph,
  getProcessDefDefinition,
  validateProcessDefGraph,
  queryApproverCandidates,
} from '@/modules/workflow/api'
import type { ProcessGraphPayload } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessDef } from '@/contracts/bpm'

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

watch(
  () => props.visible,
  (val) => {
    if (val && props.processDef) {
      form.value.name = props.processDef.name
      form.value.formKey = props.processDef.formKey
      approverId.value = ''
      void loadApproverOptions()
      void loadExistingApprover()
    }
  },
)

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

/** 从已保存图数据回显审批人（若有） */
async function loadExistingApprover() {
  if (!props.processDef) return
  try {
    const graph = await getProcessDefDefinition(props.processDef.id)
    const approvalNode = (graph.elements ?? []).find(
      (el) => el.kind === 'node' && el.type === 'APPROVAL',
    )
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

/** 组装最小单节点审批图：START → APPROVAL → END */
function buildGraph(): ProcessGraphPayload {
  if (!props.processDef) throw new Error('processDef missing')
  return {
    processKey: props.processDef.processKey,
    name: form.value.name,
    formKey: form.value.formKey,
    elements: [
      { id: 'node_start', kind: 'node', type: 'START', config: {}, style: { x: 100, y: 300 } },
      {
        id: 'node_approval',
        kind: 'node',
        type: 'APPROVAL',
        config: {
          name: '审批',
          approver: { type: 'DESIGNATED', value: [approverId.value] },
        },
        style: { x: 400, y: 300 },
      },
      { id: 'node_end', kind: 'node', type: 'END', config: {}, style: { x: 700, y: 300 } },
      {
        id: 'edge_1',
        kind: 'edge',
        source: 'node_start',
        target: 'node_approval',
        config: {},
        style: {},
      },
      {
        id: 'edge_2',
        kind: 'edge',
        source: 'node_approval',
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
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入流程名称')
    return
  }
  if (!form.value.formKey.trim()) {
    ElMessage.warning('请输入表单标识')
    return
  }
  if (!approverId.value) {
    ElMessage.warning('请选择审批人')
    return
  }
  if (!props.processDef) return

  saving.value = true
  try {
    const graph = buildGraph()
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
      <el-form-item label="审批节点">
        <div class="approval-config">
          <div class="approval-flow">
            <el-tag>开始</el-tag>
            <span class="arrow">→</span>
            <el-tag type="warning">审批</el-tag>
            <span class="arrow">→</span>
            <el-tag type="success">结束</el-tag>
          </div>
          <el-select
            v-model="approverId"
            placeholder="选择审批人"
            :loading="approverLoading"
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
      <el-button type="primary" :loading="saving || validating" @click="handleSave">
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
.arrow {
  color: var(--el-text-color-secondary);
}
.approver-select {
  width: 100%;
}
</style>
