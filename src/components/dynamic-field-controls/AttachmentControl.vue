<script setup lang="ts">
import { i18n } from '@/locales'

// form-create 子 app（FormPreview WYSIWYG）未安装 vue-i18n 插件，
// useI18n() 会在该上下文抛错；global 实例不依赖宿主 app 安装。
const t = i18n.global.t
/**
 * 附件/图片（ATTACHMENT/IMAGE）控件。
 * 值 = [{storageKey, name}]；上传走 /workflow/attachments/upload（登录态），
 * 下载/查看通过登录态请求，后端核对记录、字段查看权与实际文件关联。
 * 图片模式（image）渲染缩略预览。
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, UploadFilled } from '@element-plus/icons-vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'
import type { AttachmentField, AttachmentItem, ImageField } from '@/contracts/form-schema'
import { request, ApiError } from '@/foundation/request'
import documentIcon from '@/assets/form-palette/document.svg'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

/** image 模式：field.type === 'IMAGE' 时渲染缩略预览。 */
const isImage = computed(() => (props.field as AttachmentField | ImageField).type === 'IMAGE')

const items = computed<AttachmentItem[]>(() => {
  if (!Array.isArray(props.modelValue)) return []
  return props.modelValue.flatMap((item): AttachmentItem[] => {
    if (typeof item === 'string' && item) {
      return [{ storageKey: item, name: item.split('/').pop() || item }]
    }
    if (item && typeof item.storageKey === 'string' && item.storageKey) {
      return [
        {
          storageKey: item.storageKey,
          name:
            typeof item.name === 'string' && item.name
              ? item.name
              : item.storageKey.split('/').pop() || item.storageKey,
        },
      ]
    }
    return []
  })
})

const uploading = ref(false)
const downloadingKey = ref<string | null>(null)
const canDownload = computed(() => Boolean(props.formKey && props.recordId))
const previewSources = ref<Record<string, string>>({})
const previewFailed = ref<Record<string, boolean>>({})
let previewSequence = 0
onBeforeUnmount(() => {
  previewSequence++
})

function attachmentBlob(item: AttachmentItem): Promise<globalThis.Blob> {
  return request<globalThis.Blob>({
    method: 'GET',
    url: `/workflow/attachments/${encodeURIComponent(props.recordId || '')}/download`,
    params: { formKey: props.formKey, storageKey: item.storageKey, name: item.name },
    responseType: 'blob',
  })
}

async function downloadItem(item: AttachmentItem) {
  if (!canDownload.value || downloadingKey.value) return
  downloadingKey.value = item.storageKey
  try {
    const blob = await attachmentBlob(item)
    const url = globalThis.URL.createObjectURL(blob)
    try {
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = item.name
      globalThis.document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
      }
    } finally {
      globalThis.URL.revokeObjectURL(url)
    }
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.msg : t('component.attachmentDownloadFailed'))
  } finally {
    downloadingKey.value = null
  }
}

function imageDataUrl(blob: globalThis.Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new globalThis.FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Image preview read failed'))
    reader.readAsDataURL(blob)
  })
}

watch(
  () => [props.formKey, props.recordId, isImage.value, items.value.map((item) => item.storageKey)],
  async () => {
    const sequence = ++previewSequence
    previewSources.value = {}
    previewFailed.value = {}
    if (!isImage.value || !canDownload.value) return
    await Promise.all(
      items.value.map(async (item) => {
        try {
          const source = await imageDataUrl(await attachmentBlob(item))
          if (sequence === previewSequence) previewSources.value[item.storageKey] = source
        } catch {
          if (sequence === previewSequence) previewFailed.value[item.storageKey] = true
        }
      }),
    )
  },
  { immediate: true, deep: true },
)

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
    ElMessage.error(t('common.uploadFailed'))
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
  <div class="attachment-control" :class="{ 'attachment-control--readonly': readonly }">
    <ul v-if="items.length" class="attachment-control__list">
      <li v-for="item in items" :key="item.storageKey" class="attachment-control__row">
        <div class="attachment-control__entry">
          <img
            v-if="isImage && previewSources[item.storageKey] && !previewFailed[item.storageKey]"
            :src="previewSources[item.storageKey]"
            :alt="item.name"
            class="attachment-control__thumb"
            @error="previewFailed[item.storageKey] = true"
          />
          <img
            v-else
            :src="documentIcon"
            class="attachment-control__icon"
            alt=""
            aria-hidden="true"
          />
          <span class="attachment-control__name" :title="item.name">{{ item.name }}</span>
          <span
            v-if="previewFailed[item.storageKey]"
            class="attachment-control__preview-error"
            role="status"
          >
            {{ t('component.imagePreviewUnavailable') }}
          </span>
          <el-button
            v-if="readonly && canDownload"
            class="attachment-control__download"
            link
            type="primary"
            :aria-label="t('component.downloadFileNamed', { name: item.name })"
            :loading="downloadingKey === item.storageKey"
            :disabled="downloadingKey !== null"
            @click="downloadItem(item)"
            >{{ t('common.download') }}</el-button
          >
          <el-button
            v-if="!readonly"
            :icon="Delete"
            size="small"
            text
            type="danger"
            @click="removeItem(item)"
          />
        </div>
      </li>
    </ul>
    <label v-if="!readonly" class="attachment-control__upload">
      <el-icon :size="16"><UploadFilled /></el-icon>
      <span>{{
        uploading
          ? t('common.uploading')
          : (props.field as { placeholder?: string }).placeholder ||
            (isImage ? t('common.uploadImage') : t('common.uploadAttachment'))
      }}</span>
      <input type="file" :disabled="uploading" @change="onFileChange" />
    </label>
  </div>
</template>

<style scoped>
.attachment-control {
  width: 100%;
}
.attachment-control__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.attachment-control__row {
  padding: 4px 0;
}
.attachment-control__entry {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}
.attachment-control__name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 22px;
  overflow-wrap: anywhere;
  color: var(--sw-text-regular);
}
.attachment-control--readonly .attachment-control__row {
  box-sizing: border-box;
  min-height: 64px;
  padding: 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}
.attachment-control__icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
}
.attachment-control__download {
  flex: 0 0 auto;
  min-width: 56px;
  height: 32px;
  padding: 0 12px;
  margin-block: -2px;
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
}
.attachment-control__preview-error {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.attachment-control__thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}
.attachment-control__upload {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 9px 14px;
  font-size: 13px;
  color: #99a5bb;
  border: 1px solid #e4eaf5;
  border-radius: 6px;
  cursor: pointer;
}
.attachment-control__upload input[type='file'] {
  display: none;
}
</style>
