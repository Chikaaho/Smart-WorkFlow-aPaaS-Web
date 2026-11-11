<script setup lang="ts">
/**
 * BusinessDetailDialog — 表单数据 + 流程详情的统一只读弹窗。
 *
 * 抄送详情、表单数据详情、实例详情共用同一套弹窗布局：
 * 不展示流程名称/实例状态等元信息，只呈现业务表单字段与流程信息。
 */
import PrintActions from '@/modules/workflow/components/PrintActions.vue'
import { computed, ref, useSlots, watch } from 'vue'
import { useI18n } from '@/locales'
import BusinessFormReadonly from './BusinessFormReadonly.vue'
import { getFormData } from '@/adapters/form-runtime'
import { getInstanceRelation, type InstanceRelation } from '@/adapters/instance-relation'
import { InstanceFlowPanel } from '@/adapters/instance-flow'
import type { ApprovalHistoryItem } from '@/contracts/bpm'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
    formKey?: string | null
    recordId?: string | null
    record?: Record<string, unknown> | null
    /** 表单记录缺失时的回退数据（如程序化发起实例的引擎 formData 快照） */
    fallbackRecord?: Record<string, unknown> | null
    processDefinitionKey?: string | null
    currentNodeKey?: string | null
    approvalHistory?: ApprovalHistoryItem[] | null
    /** 流程实例标识（1.0.0 F2：有值时 PDF 并入审批历史；发起人/参与人/超管可见） */
    processInstanceId?: string | null
  }>(),
  {
    title: '',
    width: '100vw',
    formKey: '',
    recordId: '',
    record: null,
    fallbackRecord: null,
    processDefinitionKey: '',
    currentNodeKey: '',
    approvalHistory: null,
    processInstanceId: '',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const slots = useSlots()

/** 任务办理详情由调用方经 #task 插槽传入（共享组件不横向依赖业务模块）。 */
const hasTaskSlot = computed(() => Boolean(slots.task))

const internalLoading = ref(false)
const errorMsg = ref('')
const loadedRecord = ref<Record<string, unknown> | null>(null)
const relation = ref<InstanceRelation | null>(null)
let loadToken = 0

const effectiveRecord = computed(() => props.record ?? loadedRecord.value)
const history = computed<ApprovalHistoryItem[]>(
  () => props.approvalHistory ?? relation.value?.approvalHistory ?? [],
)
const processKey = computed(
  () => props.processDefinitionKey || relation.value?.instance?.processDefKey || '',
)
const currentNodeKey = computed(
  () => props.currentNodeKey || relation.value?.instance?.currentNodeKeys?.[0] || '',
)
const hasFlow = computed(() => history.value.length > 0 || Boolean(processKey.value))

/**
 * 打印实例上下文：调用方显式传入优先，否则使用记录关联到的实例。
 * 三处入口（表单详情/任务详情/我发起的）由此共用同一份提交时版本定位。
 */
const effectiveProcessInstanceId = computed(
  () => props.processInstanceId || relation.value?.instance?.processInstanceId || undefined,
)

/** 空对象视为无回退数据（不伪造空表单）。 */
function usableFallback(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return Object.keys(raw as Record<string, unknown>).length > 0
    ? (raw as Record<string, unknown>)
    : null
}

async function load() {
  if (!props.modelValue) return
  const token = ++loadToken
  internalLoading.value = true
  errorMsg.value = ''
  relation.value = null
  loadedRecord.value = null
  try {
    const tasks: Array<Promise<unknown>> = []
    if (!props.record && props.formKey && props.recordId) {
      tasks.push(
        getFormData(props.formKey, props.recordId)
          .then((row) => {
            if (token === loadToken) loadedRecord.value = row
          })
          .catch(() => {
            // 程序化发起实例（Agent/IoT/API）没有表单记录：回退实例 formData 快照渲染
            if (token !== loadToken) return
            const fallback = usableFallback(props.fallbackRecord)
            if (fallback) loadedRecord.value = fallback
            else errorMsg.value = '表单数据暂时无法显示'
          }),
      )
    }
    if (!props.approvalHistory && props.formKey && props.recordId) {
      tasks.push(
        getInstanceRelation(props.formKey, props.recordId)
          .then((value) => {
            if (token === loadToken) relation.value = value
          })
          .catch(() => {
            // 无流程关系时详情仍可只读展示表单
          }),
      )
    }
    await Promise.all(tasks)
    if (token === loadToken && !props.record && !loadedRecord.value) {
      const loadedRelation = relation.value as InstanceRelation | null
      const fallback =
        usableFallback(props.fallbackRecord) ?? usableFallback(loadedRelation?.formData)
      if (fallback) {
        loadedRecord.value = fallback
        errorMsg.value = ''
      }
    }
  } finally {
    if (token === loadToken) internalLoading.value = false
  }
}

watch(
  () => [
    props.modelValue,
    props.formKey,
    props.recordId,
    props.record,
    props.fallbackRecord,
    props.approvalHistory,
  ],
  () => void load(),
  { immediate: true },
)
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title || t('common.detail')"
    :width="width"
    top="0"
    class="business-detail-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="internalLoading" class="business-detail-dialog__body">
      <slot v-if="hasTaskSlot" name="task" />

      <template v-else>
        <div class="business-detail-dialog__print-row">
          <PrintActions
            v-if="formKey && recordId"
            :form-key="formKey"
            :record-id="recordId"
            :process-instance-id="effectiveProcessInstanceId"
          />
        </div>
        <el-alert v-if="errorMsg" :title="errorMsg" type="warning" :closable="false" show-icon />

        <BusinessFormReadonly
          v-if="formKey"
          :form-key="formKey"
          :record-id="recordId"
          :record="effectiveRecord"
        />
        <el-alert
          v-else
          :title="t('workflow.noFormData')"
          type="info"
          :closable="false"
          show-icon
        />

        <template v-if="hasFlow">
          <InstanceFlowPanel
            :approval-history="history"
            :process-definition-key="processKey"
            :current-node-key="currentNodeKey"
          />
        </template>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
:global(.business-detail-dialog.el-dialog) {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 100vw;
  margin: 0 !important;
  padding: 0;
  border-radius: 0;
}
:global(.business-detail-dialog .el-dialog__header) {
  box-sizing: border-box;
  flex: 0 0 48px;
  height: 48px;
  margin: 0;
  padding: 12px 68px 12px 24px;
  border: 0;
}
:global(.business-detail-dialog .el-dialog__title) {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 24px;
}
:global(.business-detail-dialog .el-dialog__headerbtn) {
  top: 8px;
  right: 24px;
  width: 32px;
  height: 32px;
}
:global(.business-detail-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  background: var(--sw-fill-base);
}
.business-detail-dialog__body {
  box-sizing: border-box;
  min-height: 120px;
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
  padding: 12px 20px 24px;
}
.business-detail-dialog__body > :deep(.instance-flow-panel) {
  margin-top: 12px;
}
@media (max-width: 767px) {
  .business-detail-dialog__body {
    padding: 12px;
  }
}
</style>
