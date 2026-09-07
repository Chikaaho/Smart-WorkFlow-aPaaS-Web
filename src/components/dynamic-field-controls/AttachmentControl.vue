<script setup lang="ts">
/**
 * 附件/图片（ATTACHMENT/IMAGE）控件。
 * 值 = [{storageKey, name}]；上传走 /workflow/attachments/upload（登录态），
 * 下载/查看由后端按记录对象权限放行。readonly 只读展示文件名。
 * 图片模式（image）渲染缩略预览。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, UploadFilled } from '@element-plus/icons-vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { AttachmentField, AttachmentItem, ImageField } from '@/contracts/form-schema'
import { request } from '@/foundation/request'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

/** image 模式：field.type === 'IMAGE' 时渲染缩略预览。 */
const isImage = computed(() => (props.field as AttachmentField | ImageField).type === 'IMAGE')

const items = computed<AttachmentItem[]>(() =>
  Array.isArray(props.modelValue) ? (props.modelValue as AttachmentItem[]) : [],
)

const uploading = ref(false)

/* eslint-disable no-undef */
interface UploadResp {
  storageKey: string
  storageName: string
  fileSize: number
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const resp = await request<UploadResp>({
      method: 'POST',
      url: '/workflow/attachments/upload',
      data: form,
    })
    const next: AttachmentItem[] = [
      ...items.value,
      { storageKey: resp.storageKey, name: file.name },
    ]
    emit('update:modelValue', next)
  } catch {
    ElMessage.error('上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function removeItem(item: AttachmentItem) {
  emit(
    'update:modelValue',
    items.value.filter((it) => it.storageKey !== item.storageKey),
  )
}
</script>

<template>
  <div class="attachment-control">
    <ul v-if="items.length" class="attachment-control__list">
      <li v-for="item in items" :key="item.storageKey" class="attachment-control__row">
        <img
          v-if="isImage"
          :src="`/api/workflow/attachments/download?storageKey=${encodeURIComponent(item.storageKey)}&name=${encodeURIComponent(item.name)}`"
          :alt="item.name"
          class="attachment-control__thumb"
        />
        <span class="attachment-control__name">{{ item.name }}</span>
        <el-button
          v-if="!readonly"
          :icon="Delete"
          size="small"
          text
          type="danger"
          @click="removeItem(item)"
        />
      </li>
    </ul>
    <label v-if="!readonly" class="attachment-control__upload">
      <el-icon :size="16"><UploadFilled /></el-icon>
      <span>{{ uploading ? '上传中…' : isImage ? '上传图片' : '上传附件' }}</span>
      <input type="file" :disabled="uploading" @change="onFileChange" />
    </label>
  </div>
</template>

<style scoped>
.attachment-control__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.attachment-control__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.attachment-control__name {
  flex: 1;
  font-size: 13px;
}
.attachment-control__thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}
.attachment-control__upload {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 4px 10px;
  font-size: 13px;
  color: var(--sw-color-primary, #7e306b);
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
}
.attachment-control__upload input[type='file'] {
  display: none;
}
</style>
