<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ModelFormDialog — 大模型配置新增/编辑弹窗（独立组件，仅被 ModelList 引用）。
 *
 * 高代码轨表单（el-dialog + StandardFormTemplate + FormSection/FormGrid 手写控件），
 * 覆盖 AgentModelSaveReq 全量契约字段（F1 D022-02 两级模型，密钥移至供应商侧）：
 *   所属供应商(启用中下拉) / 名称 / 模型名称 / 能力标注(CHAT|EMBEDDING) /
 *   temperature / maxTokens / topP / timeoutSeconds / retryCount /
 *   enabled / remark / groupKey / sort / quotaCooldownSeconds。
 *
 * 安全硬边界：本表单不含任何 API Key 字段——密钥只在供应商（ProviderFormDialog）侧管理。
 *
 * lockedUntil 为系统运行态（只读）：编辑回填后仅作「冷却至 xx」信息条展示，
 * 无任何可写控件，提交请求体也不含该字段。
 *
 * 权限：本弹窗仅由 ModelList 在按钮权限通过后打开；真实鉴权在后端。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createModel, getModel, updateModel, listEnabledProviders } from '@/modules/agent/api'
import type { AgentProvider, AgentModel, AgentModelSaveReq } from '@/contracts/agent'
import { StandardFormTemplate, FormSection, FormGrid } from '@/components/page-layout'

const props = defineProps<{
  /** 弹窗显隐（父组件控制） */
  visible: boolean
  /** 编辑目标 id；null = 新增 */
  modelId: number | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 保存成功后通知父组件刷新列表 */
  saved: []
}>()

// ─── 供应商选项（启用中的供应商下拉，F1 两级模型） ───

const providerOptions = ref<AgentProvider[]>([])
const providersLoading = ref(false)

async function loadProviders() {
  providersLoading.value = true
  try {
    providerOptions.value = await listEnabledProviders()
  } catch {
    providerOptions.value = []
  } finally {
    providersLoading.value = false
  }
}

// ─── 能力标注选项（CHAT / EMBEDDING；后端按含式匹配过滤） ───

const CAPABILITY_OPTIONS = [
  {
    get label() {
      return t('agent.capabilityChat')
    },
    value: 'CHAT',
  },
  {
    get label() {
      return t('agent.capabilityEmbedding')
    },
    value: 'EMBEDDING',
  },
] as const

// ─── 表单状态（数值字段可被 el-input-number 清空为 null，提交时兜底默认值） ───

const form = reactive({
  providerId: null as number | null,
  name: '',
  modelName: '',
  capabilities: 'CHAT',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  timeoutSeconds: 30,
  retryCount: 0,
  enabled: true,
  remark: '',
  groupKey: '',
  sort: 0,
  quotaCooldownSeconds: 60,
})

/** 编辑回填的 lockedUntil（只读展示） */
const lockedUntil = ref<string | null>(null)

const loadingDetail = ref(false)
const submitting = ref(false)
const formError = ref('')

/** 限流冷却展示（运行态只读）：非空且未过期才提示。 */
const lockedActive = computed(() => {
  if (!lockedUntil.value) return false
  const lockedMs = new Date(lockedUntil.value).getTime()
  return Number.isFinite(lockedMs) && lockedMs > Date.now()
})

// ─── 弹窗显隐桥接（props.visible ↔ update:visible） ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ─── 表单生命周期 ───

function resetForm() {
  form.providerId = null
  form.name = ''
  form.modelName = ''
  form.capabilities = 'CHAT'
  form.temperature = 0.7
  form.maxTokens = 4096
  form.topP = 1
  form.timeoutSeconds = 30
  form.retryCount = 0
  form.enabled = true
  form.remark = ''
  form.groupKey = ''
  form.sort = 0
  form.quotaCooldownSeconds = 60
  lockedUntil.value = null
  formError.value = ''
}

function fillForm(detail: AgentModel) {
  form.providerId = detail.providerId
  form.name = detail.name
  form.modelName = detail.modelName
  form.capabilities = detail.capabilities || 'CHAT'
  form.temperature = detail.temperature ?? 0.7
  form.maxTokens = detail.maxTokens ?? 4096
  form.topP = detail.topP ?? 1
  form.timeoutSeconds = detail.timeoutSeconds
  form.retryCount = detail.retryCount
  form.enabled = detail.enabled
  form.remark = detail.remark ?? ''
  form.groupKey = detail.groupKey ?? ''
  form.sort = detail.sort
  form.quotaCooldownSeconds = detail.quotaCooldownSeconds
  lockedUntil.value = detail.lockedUntil
}

async function initForm() {
  resetForm()
  void loadProviders()
  if (props.modelId === null) return
  loadingDetail.value = true
  try {
    const detail = await getModel(props.modelId)
    fillForm(detail)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('agent.modelDetailLoadFailed')
  } finally {
    loadingDetail.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void initForm()
  },
  { immediate: true },
)

// ─── 校验（必填/数值范围/URL；校验失败不提交） ───

function validate(): string | null {
  if (form.providerId == null) return t('agent.selectProvider')
  if (!form.name.trim()) return t('agent.configNameRequired')
  if (!form.modelName.trim()) return t('agent.modelNameRequired')
  if (form.temperature !== null && (form.temperature < 0 || form.temperature > 2)) {
    return t('agent.temperatureRange')
  }
  if (form.maxTokens !== null && form.maxTokens < 1) {
    return t('agent.maxTokensPositiveInteger')
  }
  if (form.topP !== null && (form.topP < 0 || form.topP > 1)) {
    return t('agent.topPRange')
  }
  if (form.timeoutSeconds == null || form.timeoutSeconds < 1) {
    return t('agent.timeoutPositiveInteger')
  }
  if (form.retryCount == null || form.retryCount < 0) {
    return t('agent.retriesNonNegativeInteger')
  }
  if (form.sort == null || form.sort < 0) {
    return t('agent.groupPriorityNonNegativeInteger')
  }
  if (form.quotaCooldownSeconds == null || form.quotaCooldownSeconds < 0) {
    return t('agent.rateLimitCooldownNonNegativeInteger')
  }
  return null
}

// ─── 提交 ───

function buildSaveReq(): AgentModelSaveReq {
  const req: AgentModelSaveReq = {
    providerId: form.providerId as number,
    name: form.name.trim(),
    modelName: form.modelName.trim(),
    capabilities: form.capabilities,
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    topP: form.topP,
    timeoutSeconds: form.timeoutSeconds ?? 30,
    retryCount: form.retryCount ?? 0,
    enabled: form.enabled,
    remark: form.remark.trim() || undefined,
    groupKey: form.groupKey.trim() || null,
    sort: form.sort ?? 0,
    quotaCooldownSeconds: form.quotaCooldownSeconds ?? 60,
  }
  return req
}

async function handleSubmit() {
  const msg = validate()
  if (msg) {
    formError.value = msg
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const req = buildSaveReq()
    if (props.modelId !== null) {
      await updateModel(props.modelId, req)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createModel(req)
      ElMessage.success(t('common.createSuccess'))
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    :title="modelId !== null ? t('agent.editModelConfig') : t('agent.newModelConfig')"
    class="model-form-dialog"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
        <el-alert
          v-if="lockedActive"
          :title="t('agent.modelCoolingDown', { lockedUntil })"
          type="warning"
          :closable="false"
          show-icon
        />
      </template>

      <FormSection :title="t('common.basicInfo')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.provider') }}</label>
            <el-select
              v-model="form.providerId"
              :loading="providersLoading"
              :placeholder="t('agent.selectProvider')"
              style="width: 100%"
            >
              <el-option
                v-for="p in providerOptions"
                :key="p.id"
                :label="t('common.nameWithCode', { name: p.name, code: p.apiFormat })"
                :value="p.id"
              />
            </el-select>
            <div class="form-field__hint">{{ t('agent.providerManageHint') }}</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('common.name') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('agent.modelConfigNamePlaceholder')"
              maxlength="128"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.modelName') }}</label>
            <el-input
              v-model="form.modelName"
              :placeholder="t('agent.modelNamePlaceholder')"
              maxlength="128"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.capabilities') }}</label>
            <el-select v-model="form.capabilities" style="width: 100%">
              <el-option
                v-for="opt in CAPABILITY_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('common.toggle') }}</label>
            <el-switch
              v-model="form.enabled"
              :active-text="t('common.enable')"
              :inactive-text="t('common.disable')"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('agent.callParameters')">
        <FormGrid :columns="2">
          <div class="form-field">
            <label class="form-field__label">Temperature</label>
            <el-input-number
              v-model="form.temperature"
              :min="0"
              :max="2"
              :step="0.1"
              placeholder="0 ~ 2"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">Max Tokens</label>
            <el-input-number
              v-model="form.maxTokens"
              :min="1"
              :step="1"
              :placeholder="t('agent.maxOutputTokens')"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">Top P</label>
            <el-input-number
              v-model="form.topP"
              :min="0"
              :max="1"
              :step="0.1"
              placeholder="0 ~ 1"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.timeoutSeconds') }}</label>
            <el-input-number
              v-model="form.timeoutSeconds"
              :min="1"
              :step="1"
              :placeholder="t('agent.defaultThirty')"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.retries') }}</label>
            <el-input-number
              v-model="form.retryCount"
              :min="0"
              :step="1"
              :placeholder="t('agent.defaultZero')"
              style="width: 100%"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('agent.multiKeyConfig')">
        <FormGrid :columns="2">
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.multiKeyGroup') }}</label>
            <el-input
              v-model="form.groupKey"
              :placeholder="t('agent.multiKeyGroupHint')"
              maxlength="64"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.groupPriority') }}</label>
            <el-input-number
              v-model="form.sort"
              :min="0"
              :step="1"
              :placeholder="t('agent.groupPriorityHint')"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.quotaCooldownSeconds') }}</label>
            <el-input-number
              v-model="form.quotaCooldownSeconds"
              :min="0"
              :step="1"
              :placeholder="t('agent.rateLimitCooldownHint')"
              style="width: 100%"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('common.remark')">
        <FormGrid :columns="1">
          <div class="form-field">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="3"
              :placeholder="t('common.remarkPlaceholder')"
              maxlength="256"
              show-word-limit
            />
          </div>
        </FormGrid>
      </FormSection>

      <template #actions>
        <el-button :disabled="submitting || loadingDetail" @click="emit('update:visible', false)">{{
          t('common.cancel')
        }}</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="loadingDetail"
          @click="handleSubmit"
          >{{ t('common.save') }}</el-button
        >
      </template>
    </StandardFormTemplate>
  </el-dialog>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}

.form-field__label {
  font-size: var(--sw-font-body);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
}

.form-field--required .form-field__label::before {
  content: '* ';
  color: var(--sw-danger);
}

.form-field__hint {
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
</style>

<style>
/* B021-010：720 宽弹窗内容高约 1150，在 1080 视口下顶部 142 起即越过视口底，
   页脚按钮需滚动整页才可见。限高为视口内并让正文区内部滚动，页脚常驻可见。
   （仅本弹窗类作用域，不改其他固定尺寸弹窗的既有几何。） */
.model-form-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  /* EP 默认 15vh 顶部间距需一并扣除，否则顶部起点+限高仍越过视口 */
  max-height: calc(100vh - var(--el-dialog-margin-top, 15vh) - 24px);
}
.model-form-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
</style>
