<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyTemplateFormDialog — 消息模板新增/编辑弹窗（P36 / M05-F02-01）。
 *
 * 覆盖 NotifyTemplateSaveReq 全量字段：模板代码/名称/标题模板/正文模板/启停/备注。
 * 校验与后端一致：代码字母开头仅字母数字下划线；占位符 ${var} 合法性由
 * 「变量提取」接口实时校验（同一渲染服务，前端不做正则判定）。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createNotifyTemplate, updateNotifyTemplate, getNotifyTemplate } from '@/modules/notify/api'
import type { NotifyTemplate } from '@/contracts/notify'
import { StandardFormTemplate, FormSection, FormGrid } from '@/components/page-layout'

const props = defineProps<{
  visible: boolean
  templateId: number | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

// ─── 表单状态 ───

const form = reactive({
  templateCode: '',
  name: '',
  titleTemplate: '',
  contentTemplate: '',
  enabled: true,
  remark: '',
})

const loadingDetail = ref(false)
const submitting = ref(false)
const formError = ref('')
/** 变量提取错误（占位符非法时后端返回） */
const varsError = ref('')

const isEdit = computed(() => props.templateId !== null)

// ─── 弹窗显隐桥接 ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ─── 表单生命周期 ───

function resetForm() {
  form.templateCode = ''
  form.name = ''
  form.titleTemplate = ''
  form.contentTemplate = ''
  form.enabled = true
  form.remark = ''
  formError.value = ''
  varsError.value = ''
}

function fillForm(detail: NotifyTemplate) {
  form.templateCode = detail.templateCode
  form.name = detail.name
  form.titleTemplate = detail.titleTemplate
  form.contentTemplate = detail.contentTemplate
  form.enabled = detail.enabled
  form.remark = detail.remark ?? ''
}

async function initForm() {
  resetForm()
  if (props.templateId === null) return
  loadingDetail.value = true
  try {
    const detail = await getNotifyTemplate(props.templateId)
    fillForm(detail)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('notify.templateDetailLoadFailed')
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

// ─── 本地校验（格式类）；占位符合法性交给后端提取接口 ───

function validate(): string | null {
  if (!form.templateCode.trim()) return t('notify.templateCodeRequired')
  if (!/^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(form.templateCode.trim())) {
    return t('notify.templateCodeFormat')
  }
  if (!form.name.trim()) return t('notify.templateNameRequired')
  if (!form.titleTemplate.trim()) return t('notify.titleTemplateRequired')
  if (!form.contentTemplate.trim()) return t('notify.contentTemplateRequired')
  return null
}

// ─── 提交 ───

async function handleSubmit() {
  const msg = validate()
  if (msg) {
    formError.value = msg
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    const req = {
      templateCode: form.templateCode.trim(),
      name: form.name.trim(),
      titleTemplate: form.titleTemplate,
      contentTemplate: form.contentTemplate,
      enabled: form.enabled,
      remark: form.remark.trim() || undefined,
    }
    if (isEdit.value && props.templateId !== null) {
      await updateNotifyTemplate(props.templateId, req)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createNotifyTemplate(req)
      ElMessage.success(t('common.createSuccess'))
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    // 非法占位符/代码重复等业务拒绝信息直接展示（后端为唯一裁决）
    formError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    :title="isEdit ? t('notify.editTemplate') : t('notify.newTemplate')"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
        <el-alert v-if="varsError" :title="varsError" type="error" :closable="false" show-icon />
      </template>

      <FormSection :title="t('common.basicInfo')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('notify.templateCode') }}</label>
            <el-input
              v-model="form.templateCode"
              :placeholder="t('notify.templateCodePlaceholder')"
              maxlength="100"
              :disabled="isEdit"
            />
            <div class="form-field__hint">
              发送标识，同租户唯一；{{
                isEdit
                  ? t('notify.templateCodeImmutableEdit')
                  : t('notify.templateCodeImmutableNew')
              }}
            </div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('common.name') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('notify.templateDisplayNamePlaceholder')"
              maxlength="100"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('common.toggle') }}</label>
            <el-switch
              v-model="form.enabled"
              :active-text="t('common.enable')"
              :inactive-text="t('common.disable')"
            />
            <div class="form-field__hint">{{ t('notify.disableHint') }}</div>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('notify.templateContent')">
        <FormGrid :columns="1">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('notify.titleTemplate') }}</label>
            <el-input
              v-model="form.titleTemplate"
              :placeholder="t('notify.subjectPlaceholder')"
              maxlength="200"
              style="font-family: monospace"
            />
            <div class="form-field__hint">{{ t('notify.variableNameFormat') }}</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('notify.contentTemplate') }}</label>
            <el-input
              v-model="form.contentTemplate"
              type="textarea"
              :rows="5"
              :placeholder="t('notify.contentPlaceholder')"
              style="font-family: monospace"
            />
            <div class="form-field__hint">
              {{ t('notify.templateLimitNote') }}
            </div>
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
