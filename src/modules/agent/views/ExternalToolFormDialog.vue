<script setup lang="ts">
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
    formError.value = err instanceof ApiError ? err.msg : '加载外部工具详情失败'
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
  if (!form.name.trim()) return '工具名不能为空'
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(form.name.trim())) {
    return '工具名只能包含英文字母、数字和下划线，且以字母或下划线开头'
  }
  if (!form.description.trim()) return '描述不能为空'
  if (!form.url.trim()) return 'URL 不能为空'
  try {
    const u = new URL(form.url.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return 'URL 必须为 http:// 或 https:// 开头'
    }
  } catch {
    return 'URL 格式不正确（需为 http(s):// 开头的完整地址）'
  }
  if (!form.httpMethod) return '请选择 HTTP 方法'
  if (form.timeoutSeconds == null || form.timeoutSeconds < 1) {
    return '超时时间需为正整数（秒）'
  }
  if (form.inputSchema.trim()) {
    try {
      JSON.parse(form.inputSchema.trim())
    } catch {
      return '入参 Schema 不是合法的 JSON 格式'
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
      ElMessage.success('更新成功')
    } else {
      await createExternalTool(req)
      ElMessage.success('创建成功')
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : '保存失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    :title="toolId !== null ? '编辑外部 HTTP 工具' : '新增外部 HTTP 工具'"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
      </template>

      <FormSection title="基本信息">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">工具名</label>
            <el-input
              v-model="form.name"
              placeholder="英文下划线格式，如 web_search"
              maxlength="128"
            />
            <div class="form-field__hint">传给 LLM 的工具标识，必须为英文下划线格式</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">描述</label>
            <el-input
              v-model="form.description"
              placeholder="描述工具的用途，传给 LLM 理解工具语义"
              maxlength="512"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">启停</label>
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="HTTP 配置">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">请求 URL</label>
            <el-input
              v-model="form.url"
              placeholder="https://api.example.com/v1/tool"
              maxlength="1024"
            />
            <div class="form-field__hint">完整的 HTTP 请求地址（含路径）</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">HTTP 方法</label>
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
            <label class="form-field__label">超时时间（秒）</label>
            <el-input-number
              v-model="form.timeoutSeconds"
              :min="1"
              :max="300"
              :step="1"
              placeholder="默认 30"
              style="width: 100%"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="入参 Schema（可选）">
        <FormGrid :columns="1">
          <div class="form-field">
            <label class="form-field__label">inputSchema</label>
            <el-input
              v-model="form.inputSchema"
              type="textarea"
              :rows="6"
              placeholder='JSON Schema 字符串，描述入参结构，如 {"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}'
              style="font-family: monospace"
            />
            <div class="form-field__hint">可选；填写后必须为合法 JSON Schema</div>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="备注">
        <FormGrid :columns="1">
          <div class="form-field">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="3"
              placeholder="请输入备注"
              maxlength="256"
              show-word-limit
            />
          </div>
        </FormGrid>
      </FormSection>

      <template #actions>
        <el-button :disabled="submitting || loadingDetail" @click="emit('update:visible', false)">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="loadingDetail"
          @click="handleSubmit"
        >
          保存
        </el-button>
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
