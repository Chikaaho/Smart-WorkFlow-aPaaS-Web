<template>
  <span class="print-actions">
    <el-button size="small" @click="handleBrowserPrint">打印</el-button>
    <el-button size="small" :loading="downloading" @click="handleDownloadPdf">下载 PDF</el-button>
  </span>
</template>

<script setup lang="ts">
/* global Blob, document, window */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError, request } from '@/foundation/request'

/**
 * 打印动作组（1.0.0 F2-2/F2-3）：表单详情、任务详情、「我发起的」三处共用。
 * 浏览器打印走全局 @media print 版式（A4、隐藏界面骨架、表头重复、行不截断）；
 * PDF 由服务端权限过滤链生成（字段隐藏照样生效）。
 */
const props = defineProps<{
  formKey: string
  recordId?: string
  processInstanceId?: string
}>()

const downloading = ref(false)

function handleBrowserPrint() {
  document.body.classList.add('sw-printing')
  const cleanup = () => {
    document.body.classList.remove('sw-printing')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
  // 某些环境不触发 afterprint，兜底延时清理
  window.setTimeout(cleanup, 1500)
}

async function handleDownloadPdf() {
  if (!props.recordId) {
    ElMessage.warning('当前详情缺少表单记录标识，无法生成 PDF')
    return
  }
  downloading.value = true
  try {
    // GET /workflow/print/pdf（服务端权限过滤链渲染，内容与浏览器打印一致）
    const blob = await request<Blob>({
      method: 'GET',
      url: '/workflow/print/pdf',
      params: {
        formKey: props.formKey,
        recordId: props.recordId,
        ...(props.processInstanceId ? { processInstanceId: props.processInstanceId } : {}),
      },
      responseType: 'blob',
    })
    const url = globalThis.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `print-${props.recordId}.pdf`
    a.click()
    globalThis.URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : 'PDF 生成失败，请稍后重试')
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.print-actions {
  display: inline-flex;
  gap: 0;
}
</style>
