<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global URL */
/**
 * ExternalToolFormDialog — 外部 HTTP 工具新增/编辑弹窗（M07-F03-02）。
 *
 * 覆盖 AgentToolExternalSaveReq 全量字段：
 *   工具名 / 描述 / URL / HTTP 方法 / 超时时间 / inputSchema(JSON 文本框) / 启停 / 备注。
 *
 * 校验：
 *   - 工具名：必填，英文下划线格式
 *   - 描述：必填
 *   - URL：必填，合法 http(s) 地址
 *   - HTTP 方法：必填（GET/POST/PUT）
 *   - 超时时间：正整数
 *   - inputSchema：可选，但填写后必须为合法 JSON
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createExternalTool, getExternalTool, updateExternalTool } from '@/modules/agent/api'
import type { AgentToolExternalConfig } from '@/contracts/agent'
import { StandardFormTemplate, FormSection, FormGrid } from '@/components/page-layout'

const props = defineProps<{
  visible: boolean
  toolId: number | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

// ─── HTTP 方法选项 ───

const HTTP_METHOD_OPTIONS = [
  { label: 'POST', value: 'POST' },
  { label: 'GET', value: 'GET' },
  { label: 'PUT', value: 'PUT' },
] as const

// ─── 表单状态 ───

const form = reactive({
  name: '',
  description: '',
  url: '',
  httpMethod: 'POST',
  timeoutSeconds: 30,
  inputSchema: '',
  enabled: true,
  remark: '',
})

const loadingDetail = ref(false)
const submitting = ref(false)
const formError = ref('')

// ─── 弹窗显隐桥接 ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ─── 表单生命周期 ───

function resetForm() {
  form.name = ''
  form.description = ''
  form.url = ''
  form.httpMethod = 'POST'
  form.timeoutSeconds = 30
  form.inputSchema = ''
  form.enabled = true
  form.remark = ''
  formError.value = ''
}

function fillForm(detail: AgentToolExternalConfig) {
  form.name = detail.name
  form.description = detail.description
  form.url = detail.url
  form.httpMethod = detail.httpMethod
  form.timeoutSeconds = detail.timeoutSeconds
  form.inputSchema = detail.inputSchema ?? ''
  form.enabled = detail.enabled
  form.remark = detail.remark ?? ''
}

async function initForm() {
  resetForm()
  if (props.toolId === null) return
  loadingDetail.value = true
  try {
    const detail = await getExternalTool(props.toolId)
    fillForm(detail)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('agent.externalToolLoadFailed')
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
  if (!form.name.trim()) return t('agent.toolNameRequired')
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(form.name.trim())) {
    return t('agent.toolNameFormat')
  }
  if (!form.description.trim()) return t('agent.toolDescriptionRequired')
  if (!form.url.trim()) return t('agent.urlRequired')
  try {
    const u = new URL(form.url.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return t('agent.urlSchemeRequired')
    }
  } catch {
    return t('agent.urlInvalid')
  }
  if (!form.httpMethod) return t('agent.selectHttpMethod')
  if (form.timeoutSeconds == null || form.timeoutSeconds < 1) {
    return t('agent.timeoutPositiveInteger')
  }
  if (form.inputSchema.trim()) {
    try {
      JSON.parse(form.inputSchema.trim())
    } catch {
      return t('agent.inputSchemaInvalidJson')
    }
  }
  return null
}

// ─── 提交 ───

function buildSaveReq() {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    url: form.url.trim(),
    httpMethod: form.httpMethod,
    timeoutSeconds: form.timeoutSeconds ?? 30,
    inputSchema: form.inputSchema.trim() || null,
    enabled: form.enabled,
    remark: form.remark.trim() || null,
  }
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
    if (props.toolId !== null) {
      await updateExternalTool(props.toolId, req)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createExternalTool(req)
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
    :title="toolId !== null ? t('agent.editExternalHttpTool') : t('agent.newExternalHttpTool')"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
      </template>

      <FormSection :title="t('common.basicInfo')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('common.toolName') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('agent.toolNamePlaceholder')"
              maxlength="128"
            />
            <div class="form-field__hint">{{ t('agent.toolNameHint') }}</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('common.descriptionField') }}</label>
            <el-input
              v-model="form.description"
              :placeholder="t('agent.toolDescriptionHint')"
              maxlength="512"
            />
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

      <FormSection :title="t('agent.httpSectionTitle')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.requestUrl') }}</label>
            <el-input
              v-model="form.url"
              placeholder="https://api.example.com/v1/tool"
              maxlength="1024"
            />
            <div class="form-field__hint">{{ t('agent.requestUrlHint') }}</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('agent.httpMethod') }}</label>
            <el-select v-model="form.httpMethod" style="width: 100%">
              <el-option
                v-for="opt in HTTP_METHOD_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('agent.timeoutSeconds') }}</label>
            <el-input-number
              v-model="form.timeoutSeconds"
              :min="1"
              :max="300"
              :step="1"
              :placeholder="t('agent.defaultThirty')"
              style="width: 100%"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('agent.inputSchemaOptional')">
        <FormGrid :columns="1">
          <div class="form-field">
            <label class="form-field__label">inputSchema</label>
            <el-input
              v-model="form.inputSchema"
              type="textarea"
              :rows="6"
              :placeholder="t('agent.jsonSchemaPlaceholderQuery')"
              style="font-family: monospace"
            />
            <div class="form-field__hint">{{ t('agent.inputSchemaOptionalHint') }}</div>
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
