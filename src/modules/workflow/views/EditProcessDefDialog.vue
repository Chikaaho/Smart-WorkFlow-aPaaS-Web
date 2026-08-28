<script setup lang="ts">
/**
 * EditProcessDefDialog — 编辑流程定义弹窗。
 *
 * 允许编辑 DRAFT 状态流程定义的名称和表单标识。
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveProcessDefGraph } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ProcessDef } from '@/contracts/bpm'

const props = defineProps<{
  visible: boolean
  processDef: ProcessDef | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const form = ref({
  name: '',
  formKey: '',
})

const saving = ref(false)

watch(
  () => props.visible,
  (val) => {
    if (val && props.processDef) {
      form.value.name = props.processDef.name
      form.value.formKey = props.processDef.formKey
    }
  },
)

function handleClose() {
  emit('update:visible', false)
}

async function handleSave() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入流程名称')
    return
  }
  if (!form.value.formKey.trim()) {
    ElMessage.warning('请输入表单标识')
    return
  }

  if (!props.processDef) return

  saving.value = true
  try {
    // 保存图数据（简化版：只保存基本信息）
    const graph = {
      processKey: props.processDef.processKey,
      name: form.value.name,
      formKey: form.value.formKey,
      elements: [],
    }
    await saveProcessDefGraph(props.processDef.id, graph)
    ElMessage.success('保存成功')
    emit('saved')
    handleClose()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('保存失败')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="编辑流程定义"
    width="500px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form label-width="100px">
      <el-form-item label="流程名称">
        <el-input v-model="form.name" placeholder="请输入流程名称" />
      </el-form-item>
      <el-form-item label="表单标识">
        <el-input v-model="form.formKey" placeholder="请输入表单标识" :disabled="true" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>
