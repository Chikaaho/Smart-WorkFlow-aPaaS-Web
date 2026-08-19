<script setup lang="ts">
/* global URL */
/**
 * ModelFormDialog — 大模型配置新增/编辑弹窗（独立组件，仅被 ModelList 引用）。
 *
 * 高代码轨表单（el-dialog + StandardFormTemplate + FormSection/FormGrid 手写控件），
 * 覆盖 AgentModelSaveReq 全量契约字段：
 *   名称 / 协议类型(openai|ollama|other 三值，不自创) / API 地址(URL 校验) / 模型名称 /
 *   API Key(密码框) / temperature / maxTokens / topP / timeoutSeconds / retryCount /
 *   enabled / remark / groupKey / sort / quotaCooldownSeconds。
 *
 * 安全硬边界（M07-F01 风险 §5.1）：
 *   - 明文 Key 只存在于用户当次输入（form.apiKey），提交后不缓存、不回显；
 *   - 编辑时只显示后端返回的 apiKeyMasked 脱敏值（maskedApiKey）；
 *   - apiKey 留空提交 = 编辑保持旧密钥 / 新增不配置（请求体不含 apiKey 字段）。
 *
 * lockedUntil 为系统运行态（只读）：编辑回填后仅作「冷却至 xx」信息条展示，
 * 无任何可写控件，提交请求体也不含该字段。
 *
 * 权限：本弹窗仅由 ModelList 在按钮权限通过后打开；真实鉴权在后端。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createModel, getModel, updateModel } from '@/modules/agent/api'
import type { AgentModelConfig, AgentModelSaveReq } from '@/contracts/agent'
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

// ─── 协议差异提示（三值契约，切换时给用户可理解的差异说明） ───

const PROTOCOL_OPTIONS = [
  { label: 'OpenAI（兼容协议）', value: 'openai' },
  { label: 'Ollama（本地）', value: 'ollama' },
  { label: '其他', value: 'other' },
] as const

const PROTOCOL_HINTS: Record<string, string> = {
  openai: 'OpenAI 兼容协议：需配置 API Key，请求头自动附加 Bearer 鉴权',
  ollama: 'Ollama 本地协议：本地服务无需 API Key，密钥可留空',
  other: '其他协议：仅做可达性探测，不附加鉴权头',
}

const protocolHint = computed(() => PROTOCOL_HINTS[form.protocolType] ?? '')

// ─── 表单状态（数值字段可被 el-input-number 清空为 null，提交时兜底默认值） ───

const form = reactive({
  name: '',
  protocolType: 'openai',
  baseUrl: '',
  modelName: '',
  /** 明文 Key 仅存在于当次输入；提交后即被丢弃，不缓存 */
  apiKey: '',
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

/** 编辑回填的后端脱敏展示值（只展示，不加工） */
const maskedApiKey = ref<string | null>(null)
/** 编辑回填的 lockedUntil（只读展示） */
const lockedUntil = ref<string | null>(null)

const loadingDetail = ref(false)
const submitting = ref(false)
const formError = ref('')

/** 限流冷却展示（运行态只读）：非空且未过期才提示。 */
const lockedActive = computed(() => {
  if (!lockedUntil.value) return false
  const t = new Date(lockedUntil.value).getTime()
  return Number.isFinite(t) && t > Date.now()
})

// ─── 弹窗显隐桥接（props.visible ↔ update:visible） ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ─── 表单生命周期 ───

function resetForm() {
  form.name = ''
  form.protocolType = 'openai'
  form.baseUrl = ''
  form.modelName = ''
  form.apiKey = ''
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
  maskedApiKey.value = null
  lockedUntil.value = null
  formError.value = ''
}

function fillForm(detail: AgentModelConfig) {
  form.name = detail.name
  form.protocolType = detail.protocolType
  form.baseUrl = detail.baseUrl
  form.modelName = detail.modelName
  // apiKey 输入框始终为空：只展示脱敏值，绝不回填明文
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
  maskedApiKey.value = detail.apiKeyMasked
  lockedUntil.value = detail.lockedUntil
}

async function initForm() {
  resetForm()
  if (props.modelId === null) return
  loadingDetail.value = true
  try {
    const detail = await getModel(props.modelId)
    fillForm(detail)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : '加载模型详情失败'
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
  if (!form.name.trim()) return '名称不能为空'
  if (!form.protocolType) return '请选择协议类型'
  if (!form.baseUrl.trim()) return 'API 地址不能为空'
  try {
    new URL(form.baseUrl.trim())
  } catch {
    return 'API 地址格式不正确（需为 http(s):// 开头的完整地址）'
  }
  if (!form.modelName.trim()) return '模型名称不能为空'
  if (form.temperature !== null && (form.temperature < 0 || form.temperature > 2)) {
    return 'temperature 取值范围为 0 ~ 2'
  }
  if (form.maxTokens !== null && form.maxTokens < 1) {
    return 'maxTokens 需为正整数'
  }
  if (form.topP !== null && (form.topP < 0 || form.topP > 1)) {
    return 'topP 取值范围为 0 ~ 1'
  }
  if (form.timeoutSeconds == null || form.timeoutSeconds < 1) {
    return '超时时间需为正整数（秒）'
  }
  if (form.retryCount == null || form.retryCount < 0) {
    return '重试次数需为非负整数'
  }
  if (form.sort == null || form.sort < 0) {
    return '组内优先级需为非负整数'
  }
  if (form.quotaCooldownSeconds == null || form.quotaCooldownSeconds < 0) {
    return '限流冷却秒数需为非负整数'
  }
  return null
}

// ─── 提交 ───

function buildSaveReq(): AgentModelSaveReq {
  const req: AgentModelSaveReq = {
    name: form.name.trim(),
    protocolType: form.protocolType,
    baseUrl: form.baseUrl.trim(),
    modelName: form.modelName.trim(),
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
    if (props.modelId !== null) {
      await updateModel(props.modelId, req)
      ElMessage.success('更新成功')
    } else {
      await createModel(req)
      ElMessage.success('创建成功')
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : '保存失败'
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
    :title="modelId !== null ? '编辑大模型配置' : '新增大模型配置'"
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
          :title="`该配置处于限流冷却中，冷却至 ${lockedUntil}`"
          type="warning"
          :closable="false"
          show-icon
        />
      </template>

      <FormSection title="基本信息">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">名称</label>
            <el-input
              v-model="form.name"
              placeholder="请输入模型配置名称（如：GPT-4o 主模型）"
              maxlength="128"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">协议类型</label>
            <el-select v-model="form.protocolType" style="width: 100%">
              <el-option
                v-for="opt in PROTOCOL_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-alert
              v-if="protocolHint"
              :title="protocolHint"
              type="info"
              :closable="false"
              show-icon
              class="form-field__protocol-hint"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">API 地址</label>
            <el-input
              v-model="form.baseUrl"
              placeholder="https://api.openai.com/v1"
              maxlength="512"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">模型名称</label>
            <el-input v-model="form.modelName" placeholder="如：gpt-4o / llama3" maxlength="128" />
          </div>
          <div class="form-field">
            <label class="form-field__label">API Key</label>
            <el-input
              v-model="form.apiKey"
              type="password"
              show-password
              placeholder="留空=不修改（编辑时保持旧密钥 / 新增时不配置）"
              maxlength="512"
            />
            <div class="form-field__hint">
              <template v-if="maskedApiKey"
                >已配置：{{ maskedApiKey }}（留空提交将保持现有密钥）</template
              >
              <template v-else>未配置密钥（本地协议可留空）</template>
            </div>
          </div>
          <div class="form-field">
            <label class="form-field__label">启停</label>
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="调用参数">
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
              placeholder="最大输出 Token 数"
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
            <label class="form-field__label">超时时间（秒）</label>
            <el-input-number
              v-model="form.timeoutSeconds"
              :min="1"
              :step="1"
              placeholder="默认 30"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">重试次数</label>
            <el-input-number
              v-model="form.retryCount"
              :min="0"
              :step="1"
              placeholder="默认 0"
              style="width: 100%"
            />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="多 Key 配置">
        <FormGrid :columns="2">
          <div class="form-field">
            <label class="form-field__label">多 Key 分组</label>
            <el-input
              v-model="form.groupKey"
              placeholder="同分组多 Key 轮询，留空=独立配置"
              maxlength="64"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">组内优先级</label>
            <el-input-number
              v-model="form.sort"
              :min="0"
              :step="1"
              placeholder="组内优先级，越小越优先"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">额度冷却（秒）</label>
            <el-input-number
              v-model="form.quotaCooldownSeconds"
              :min="0"
              :step="1"
              placeholder="限流锁定冷却秒数，默认 60"
              style="width: 100%"
            />
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
        <el-button :disabled="submitting || loadingDetail" @click="emit('update:visible', false)"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="loadingDetail"
          @click="handleSubmit"
          >保存</el-button
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

.form-field__protocol-hint {
  margin-top: var(--sw-space-8);
}
</style>
