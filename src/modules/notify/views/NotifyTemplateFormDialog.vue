<script setup lang="ts">
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
    formError.value = err instanceof ApiError ? err.msg : '加载模板详情失败'
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
  if (!form.templateCode.trim()) return '模板代码不能为空'
  if (!/^[A-Za-z][A-Za-z0-9_]{1,98}$/.test(form.templateCode.trim())) {
    return '模板代码须为字母开头、仅字母/数字/下划线、长度2-99'
  }
  if (!form.name.trim()) return '模板名称不能为空'
  if (!form.titleTemplate.trim()) return '标题模板不能为空'
  if (!form.contentTemplate.trim()) return '正文模板不能为空'
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
      ElMessage.success('更新成功')
    } else {
      await createNotifyTemplate(req)
      ElMessage.success('创建成功')
    }
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    // 非法占位符/代码重复等业务拒绝信息直接展示（后端为唯一裁决）
    formError.value = err instanceof ApiError ? err.msg : '保存失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    :title="isEdit ? '编辑消息模板' : '新增消息模板'"
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

      <FormSection title="基本信息">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">模板代码</label>
            <el-input
              v-model="form.templateCode"
              placeholder="如 WELCOME_MAIL"
              maxlength="100"
              :disabled="isEdit"
            />
            <div class="form-field__hint">
              发送标识，同租户唯一；{{ isEdit ? '创建后不可变更' : '创建后不可修改' }}
            </div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">名称</label>
            <el-input v-model="form.name" placeholder="模板展示名" maxlength="100" />
          </div>
          <div class="form-field">
            <label class="form-field__label">启停</label>
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
            <div class="form-field__hint">停用后不可预览与发送</div>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="模板内容">
        <FormGrid :columns="1">
          <div class="form-field form-field--required">
            <label class="form-field__label">标题模板</label>
            <el-input
              v-model="form.titleTemplate"
              placeholder="支持 ${userName} 占位符，如：${userName} 的审批提醒"
              maxlength="200"
              style="font-family: monospace"
            />
            <div class="form-field__hint">变量名以字母或下划线开头，仅含字母/数字/下划线</div>
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">正文模板</label>
            <el-input
              v-model="form.contentTemplate"
              type="textarea"
              :rows="5"
              placeholder="您好 ${userName}，单据 ${docNo} 待处理。"
              style="font-family: monospace"
            />
            <div class="form-field__hint">
              仅支持简单变量替换；不支持表达式、条件、脚本。变量值按纯文本处理。
            </div>
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
