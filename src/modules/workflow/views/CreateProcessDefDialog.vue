<script setup lang="ts">
/**
 * CreateProcessDefDialog — 创建流程定义弹窗。
 *
 * 覆盖 CreateProcessDefReq 全量字段：流程名称 + 表单标识。
 * 校验与后端一致：name 和 formKey 均不能为空。
 * 表单标识通过 FormSelectDialog 选择已发布的表单定义。
 */
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createProcessDef } from '@/modules/workflow/api'
import { StandardFormTemplate, FormSection, FormGrid } from '@/components/page-layout'
import FormSelectDialog from './FormSelectDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

// ─── 表单状态 ───

const form = reactive({
  name: '',
  formKey: '',
  formName: '', // 用于显示已选表单名称
})

const submitting = ref(false)
const formError = ref('')

// ─── 表单选择弹窗状态 ───

const formSelectVisible = ref(false)

// ─── 弹窗显隐桥接 ───

const dialogModel = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

// ─── 表单生命周期 ───

function resetForm() {
  form.name = ''
  form.formKey = ''
  form.formName = ''
  formError.value = ''
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) resetForm()
  },
  { immediate: true },
)

// ─── 表单选择处理 ───

function handleFormSelect(formKey: string, formName: string) {
  form.formKey = formKey
  form.formName = formName
}

function clearFormSelection() {
  form.formKey = ''
  form.formName = ''
}

// ─── 本地校验 ───

function validate(): string | null {
  if (!form.name.trim()) return '流程名称不能为空'
  if (!form.formKey.trim()) return '请选择关联表单'
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
    await createProcessDef({
      name: form.name.trim(),
      formKey: form.formKey.trim(),
    })
    ElMessage.success('创建成功')
    emit('saved')
    emit('update:visible', false)
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : '创建失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogModel"
    title="创建流程定义"
    :close-on-click-modal="false"
    destroy-on-close
    width="560px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template #alert>
        <el-alert v-if="formError" :title="formError" type="error" :closable="false" show-icon />
      </template>

      <FormSection title="基本信息">
        <FormGrid :columns="1">
          <div class="form-field form-field--required">
            <label class="form-field__label">流程名称</label>
            <el-input v-model="form.name" placeholder="请输入流程名称" maxlength="100" />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">关联表单</label>
            <div class="form-field__selector">
              <el-input
                :model-value="form.formName ? `${form.formName} (${form.formKey})` : ''"
                placeholder="请选择关联的表单定义"
                readonly
                @click="formSelectVisible = true"
              >
                <template #suffix>
                  <el-icon
                    v-if="form.formKey"
                    class="form-field__clear-icon"
                    @click.stop="clearFormSelection"
                  >
                    <CircleClose />
                  </el-icon>
                </template>
              </el-input>
              <el-button type="primary" @click="formSelectVisible = true"> 选择表单 </el-button>
            </div>
            <div class="form-field__hint">关联已发布的表单定义，用于流程启动时加载表单</div>
          </div>
        </FormGrid>
      </FormSection>

      <template #actions>
        <el-button :disabled="submitting" @click="emit('update:visible', false)"> 取消 </el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit"> 创建 </el-button>
      </template>
    </StandardFormTemplate>

    <!-- 表单选择弹窗 -->
    <FormSelectDialog
      v-model:visible="formSelectVisible"
      :current-form-key="form.formKey"
      @select="handleFormSelect"
    />
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

.form-field__selector {
  display: flex;
  gap: var(--sw-space-8);
}

.form-field__selector .el-input {
  flex: 1;
}

.form-field__clear-icon {
  cursor: pointer;
  color: var(--sw-text-secondary);
}

.form-field__clear-icon:hover {
  color: var(--sw-text-primary);
}
</style>
