<script setup lang="ts">
/**
 * BusinessDetailDialog — 表单数据 + 流程详情的统一只读弹窗。
 *
 * 抄送详情、表单数据详情、实例详情共用同一套弹窗布局：
 * 不展示流程名称/实例状态等元信息，只呈现业务表单字段与流程信息。
 */
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
    processDefinitionKey?: string | null
    currentNodeKey?: string | null
    approvalHistory?: ApprovalHistoryItem[] | null
  }>(),
  {
    title: '',
    width: 'calc(100vw - 32px)',
    formKey: '',
    recordId: '',
    record: null,
    processDefinitionKey: '',
    currentNodeKey: '',
    approvalHistory: null,
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
            if (token === loadToken) errorMsg.value = '表单数据暂时无法显示'
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
  } finally {
    if (token === loadToken) internalLoading.value = false
  }
}

watch(
  () => [props.modelValue, props.formKey, props.recordId, props.record, props.approvalHistory],
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
        <el-alert v-if="errorMsg" :title="errorMsg" type="warning" :closable="false" show-icon />

        <h4 class="business-detail-dialog__section">
          {{ t('workflow.formDataReadonlySnapshot') }}
        </h4>
        <BusinessFormReadonly v-if="formKey" :form-key="formKey" :record="effectiveRecord" />
        <el-alert
          v-else
          :title="t('workflow.noFormData')"
          type="info"
          :closable="false"
          show-icon
        />

        <template v-if="hasFlow">
          <h4 class="business-detail-dialog__section">{{ t('workflow.approvalProgress') }}</h4>
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
/* 详情正文单独滚动；el-dialog 经 Teleport 渲染，需用 :global 穿透作用域。 */
:global(.business-detail-dialog .el-dialog__body) {
  max-height: calc(100vh - 96px);
  overflow-y: auto;
}
:global(.business-detail-dialog.el-dialog) {
  height: calc(100vh - 32px);
  margin: 16px auto !important;
  border-radius: 0;
}
.business-detail-dialog__body {
  min-height: 120px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}
@media (max-width: 767px) {
  :global(.business-detail-dialog.el-dialog) {
    width: calc(100vw - 16px) !important;
    height: calc(100vh - 16px);
    margin: 8px auto !important;
  }
  :global(.business-detail-dialog .el-dialog__body) {
    max-height: calc(100vh - 76px);
    padding: 12px;
  }
  .business-detail-dialog__body {
    max-width: 100%;
  }
}
.business-detail-dialog__section {
  margin: 16px 0 8px;
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
.business-detail-dialog__section:first-of-type {
  margin-top: 0;
}
</style>
