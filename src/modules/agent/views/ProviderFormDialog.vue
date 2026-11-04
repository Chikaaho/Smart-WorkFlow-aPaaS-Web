<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global URL */
/**
 * ProviderFormDialog — 供应商新增/编辑弹窗（F1 D022-02 两级模型，仅被 ModelList 引用）。
 *
 * 覆盖 AgentProviderSaveReq 全量契约字段：
 *   名称 / API 格式(OPENAI_CHAT|OPENAI_RESPONSES|ANTHROPIC 三值) / API 地址(URL 校验) /
 *   API Key(密码框) / enabled / remark。
 *
 * 安全硬边界（与旧模型配置一致）：
 *   - 明文 Key 只存在于用户当次输入（form.apiKey），提交后不缓存、不回显；
 *   - 编辑时只显示后端返回的 apiKeyMasked 脱敏值（maskedApiKey）；
 *   - apiKey 留空提交 = 编辑保持旧密钥 / 新增不配置（请求体不含 apiKey 字段）。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createProvider, getProvider, updateProvider } from '@/modules/agent/api'
import type { AgentProvider, AgentProviderSaveReq } from '@/contracts/agent'
import { StandardFormTemplate, FormSection, FormGrid } from '@/components/page-layout'

const props = defineProps<{
  /** 弹窗显隐（父组件控制） */
  visible: boolean
  /** 编辑目标 id；null = 新增 */
  providerId: number | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 保存成功后通知父组件刷新列表 */
  saved: []
}>()

// ─── API 格式选项（三值契约，D022-02 白名单） ───

const API_FORMAT_OPTIONS = [
  {
    get label() {
      return t('agent.formatOpenAiChat')
    },
    value: 'OPENAI_CHAT',
  },
  {
    get label() {
      return t('agent.formatOpenAiResponses')
    },
    value: 'OPENAI_RESPONSES',
  },
  {
    get label() {
      return t('agent.formatAnthropic')
    },
    value: 'ANTHROPIC',
  },
] as const

// ─── 表单状态 ───

const form = reactive({
  name: '',
  apiFormat: 'OPENAI_CHAT',
  baseUrl: '',
  /** 明文 Key 仅存在于当次输入；提交后即被丢弃，不缓存 */
  apiKey: '',
  enabled: true,
  remark: '',
})

/** 编辑回填的后端脱敏展示值（只展示，不加工） */
const maskedApiKey = ref<string | null>(null)

const loadingDetail = ref(false)
const submitting = ref(false)
const formError = ref('')

// ─── 弹窗显隐桥接 ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

function resetForm() {
  form.name = ''
  form.apiFormat = 'OPENAI_CHAT'
  form.baseUrl = ''
  form.apiKey = ''
  form.enabled = true
  form.remark = ''
  maskedApiKey.value = null
  formError.value = ''
}

function fillForm(detail: AgentProvider) {
  form.name = detail.name
  form.apiFormat = detail.apiFormat
  form.baseUrl = detail.baseUrl
  form.enabled = detail.enabled
  form.remark = detail.remark ?? ''
  maskedApiKey.value = detail.apiKeyMasked
}

async function initForm() {
  resetForm()
  if (props.providerId === null) return
  loadingDetail.value = true
  try {
    const detail = await getProvider(props.providerId)
    fillForm(detail)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('agent.providerDetailLoadFailed')
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

// ─── 校验 ───

function validate(): string | null {
  if (!form.name.trim()) return t('agent.providerNameRequired')
  const format = String(form.apiFormat)
  if (!['OPENAI_CHAT', 'OPENAI_RESPONSES', 'ANTHROPIC'].includes(format)) {
    return t('agent.selectApiFormat')
  }
  if (!form.baseUrl.trim()) return t('agent.apiUrlRequired')
  try {
    new URL(form.baseUrl.trim())
  } catch {
    return t('agent.apiUrlInvalid')
  }
  return null
}

// ─── 提交 ───

function buildSaveReq(): AgentProviderSaveReq {
  const req: AgentProviderSaveReq = {
    name: form.name.trim(),
    apiFormat: String(form.apiFormat),
    baseUrl: form.baseUrl.trim(),
    enabled: form.enabled,
    remark: form.remark.trim() || undefined,
  }
  // 留空 = 保持旧密钥（编辑）/不配置（新增）：请求体不含 apiKey 字段
  const key = form.apiKey.trim()
  if (key) {
    req.apiKey = key
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
    if (props.providerId !== null) {
      await updateProvider(props.providerId, req)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createProvider(req)
      ElMessage.success(t('common.createSuccess'))
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    // 明文 Key 已随 req 离手，立即清除输入框状态，组件内不做任何保留
    form.apiKey = ''
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    :title="providerId !== null ? t('agent.editProvider') : t('agent.newProvider')"
    :close-on-click-modal="false"
    destroy-on-close
    width="560px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
      </template>

      <FormSection :title="t('common.basicInfo')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('common.name') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('agent.providerNamePlaceholder')"
              maxlength="128"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.apiFormat') }}</label>
            <el-select v-model="form.apiFormat" style="width: 100%">
              <el-option
                v-for="opt in API_FORMAT_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.apiUrl') }}</label>
            <el-input
              v-model="form.baseUrl"
              placeholder="https://api.openai.com/v1"
              maxlength="512"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">API Key</label>
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              :placeholder="t('agent.apiKeyKeepHint')"
              maxlength="512"
            />
            <div class="form-field__hint">
              <template v-if="maskedApiKey">{{
                t('agent.maskedApiKeyLabel', { maskedApiKey })
              }}</template>
              <template v-else>{{ t('agent.apiKeyUnset') }}</template>
            </div>
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
