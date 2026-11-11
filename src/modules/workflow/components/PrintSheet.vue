<script setup lang="ts">
/**
 * PrintSheet — 浏览器打印专用版面（1.0.0 F2-2）。
 *
 * 由 PrintActions 挂载并 Teleport 到 body，屏幕隐藏、打印时独占纸张：
 * 按表单定义里的 printTemplate 过滤字段/明细表并输出抬头页脚，
 * includeHistory=false 时不打审批历史；无模板时等价默认模板（全部字段 + 审批历史）。
 * 只读，不改变任何业务状态。
 */
import { computed, ref, watch } from 'vue'
import BusinessFormReadonly from '@/components/business-detail/BusinessFormReadonly.vue'
import { getFormData, getFormDefinition } from '@/adapters/form-runtime'
import { getInstanceRelation } from '@/adapters/instance-relation'
import type { ApprovalHistoryItem } from '@/contracts/bpm'
import type { FormSchema } from '@/contracts/form-schema'

const emit = defineEmits<{ ready: [boolean] }>()

const props = defineProps<{
  formKey: string
  recordId?: string
  processInstanceId?: string
}>()

const schema = ref<FormSchema | null>(null)
const record = ref<Record<string, unknown> | null>(null)
const history = ref<ApprovalHistoryItem[]>([])
const loaded = ref(false)
let loadToken = 0

const template = computed(() => schema.value?.printTemplate)
const includeHistory = computed(() => template.value?.includeHistory !== false)
const showHistory = computed(() => includeHistory.value && history.value.length > 0)

function opinionText(item: ApprovalHistoryItem): string {
  if (item.opinionFields?.length) {
    return item.opinionFields
      .filter((field) => field.displayValue)
      .map((field) => `${field.label || field.name}：${field.displayValue}`)
      .join('；')
  }
  const comment = item.opinionData?.comment
  return typeof comment === 'string' ? comment : ''
}

function resultText(item: ApprovalHistoryItem): string {
  if (item.approvalResult === 'APPROVED') return '通过'
  if (item.approvalResult === 'REJECTED') return '驳回'
  return '进行中'
}

async function load() {
  if (!props.formKey || !props.recordId) return
  const token = ++loadToken
  loaded.value = false
  emit('ready', false)
  try {
    const [loadedSchema, loadedRecord] = await Promise.all([
      getFormDefinition(props.formKey),
      getFormData(props.formKey, props.recordId),
    ])
    if (token !== loadToken) return
    schema.value = loadedSchema
    record.value = loadedRecord
    try {
      const relation = await getInstanceRelation(props.formKey, props.recordId)
      if (token === loadToken) history.value = relation.approvalHistory ?? []
    } catch {
      // 无流程关系时仅打印表单
    }
    loaded.value = true
    emit('ready', true)
  } catch {
    if (token === loadToken) {
      loaded.value = false
      emit('ready', false)
    }
  }
}

watch(
  () => [props.formKey, props.recordId],
  () => void load(),
  { immediate: true },
)
</script>

<template>
  <div v-if="loaded" class="sw-print-sheet__content">
    <BusinessFormReadonly :form-key="formKey" :record-id="recordId" :record="record" print-mode />
    <section v-if="showHistory" class="sw-print-sheet__history">
      <h3>审批历史</h3>
      <table>
        <thead>
          <tr>
            <th>节点</th>
            <th>办理人</th>
            <th>部门</th>
            <th>结果</th>
            <th>时间</th>
            <th>意见</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in history" :key="item.taskId">
            <td>{{ item.taskName }}</td>
            <td>{{ item.assigneeName || item.assignee }}</td>
            <td>{{ item.assigneeDept || '—' }}</td>
            <td>{{ resultText(item) }}</td>
            <td>{{ (item.endTime || item.createTime || '').replace('T', ' ').slice(0, 19) }}</td>
            <td>{{ opinionText(item) || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.sw-print-sheet__content {
  width: 100%;
  color: #000;
  background: #fff;
}
.sw-print-sheet__history {
  margin-top: 16px;
}
.sw-print-sheet__history h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.sw-print-sheet__history table {
  width: 100%;
  border-collapse: collapse;
}
.sw-print-sheet__history th,
.sw-print-sheet__history td {
  padding: 4px 6px;
  border: 1px solid #999;
  font-size: 12px;
  text-align: left;
}
</style>
