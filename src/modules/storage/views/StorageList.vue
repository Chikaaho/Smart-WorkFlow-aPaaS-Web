<script setup lang="ts">
/* global File, Event, HTMLInputElement, URL, document */

/**
 * StorageList — 文件管理列表页（页型 B）。
 *
 * 使用 StandardListTemplate 槽位模板。提供文件上传、列表浏览、
 * 文件名搜索、下载和删除功能。
 *
 * 注意：后端 GET /storage/files 当前只有 page/size 参数，无 originalName 筛选参数。
 * 筛选 UI 已就位但实际不传筛选参数。待后端 Search 端点就绪后再点亮筛选。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { StandardListTemplate } from '@/components/page-layout'
import { listFiles, uploadFile, deleteFile, downloadFile } from '@/modules/storage/api'
import { formatFileSize } from '@/modules/storage/utils/format'
import type { StorageFile } from '@/contracts/storage'

// ─── 列表状态 ───

const list = ref<StorageFile[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// ─── 筛选状态（双对象模式） ───
// filter 绑定到 input v-model，currentFilter 在「查询」按钮点击时同步
// 当前后端无 originalName 参数，筛选 UI 已就位但暂停传参
const filter = reactive({ originalName: '' })
const currentFilter = reactive({ originalName: '' })

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 列表加载 ───

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    // 注意：当前不传 originalName 参数（后端暂不支持）
    const result = await listFiles(pageNum.value, pageSize.value)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载文件列表失败'
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentFilter.originalName = filter.originalName
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.originalName = ''
  currentFilter.originalName = ''
  pageNum.value = 1
  void loadList()
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

// ─── 上传弹窗 ───

const uploadDialogVisible = ref(false)
const uploadFileRef = ref<File | null>(null)
const uploading = ref(false)
const uploadError = ref('')

function openUpload() {
  uploadFileRef.value = null
  uploadError.value = ''
  uploadDialogVisible.value = true
}

function closeUpload() {
  uploadDialogVisible.value = false
  uploadFileRef.value = null
  uploadError.value = ''
  uploading.value = false
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  uploadFileRef.value = input.files?.[0] ?? null
  uploadError.value = ''
}

async function handleUpload() {
  if (!uploadFileRef.value) {
    uploadError.value = '请选择文件'
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    const result = await uploadFile(uploadFileRef.value)
    ElMessage.success(`上传成功：${result.storageName}`)
    closeUpload()
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      uploadError.value = err.msg
    } else {
      uploadError.value = '上传失败'
    }
  } finally {
    uploading.value = false
  }
}

// ─── 下载 ───

async function handleDownload(row: StorageFile) {
  try {
    const { blob, fileName } = await downloadFile(row.storageKey)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('下载失败')
    }
  }
}

// ─── 删除 ───

async function handleDelete(row: StorageFile) {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件"${row.originalName}"吗？删除后不可恢复。`,
      '删除确认',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  try {
    await deleteFile(row.storageKey)
    ElMessage.success('删除成功')
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('删除失败')
    }
  }
}

// row 类型桥接（el-table slot scope row 类型不兼容 StorageFile）
function downloadRow(r: unknown) {
  handleDownload(r as StorageFile)
}
function deleteRow(r: unknown) {
  handleDelete(r as StorageFile)
}

// ─── providerType 辅助 ───

function providerLabel(type: string): string {
  const map: Record<string, string> = {
    local: '本地',
    minio: 'MinIO',
    cos: 'COS',
    qiniu: '七牛云',
  }
  return map[type] ?? type
}

function providerTagType(type: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    local: 'info',
    minio: 'primary',
    cos: 'success',
    qiniu: 'warning',
  }
  return map[type] ?? 'info'
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="文件管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：上传按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openUpload">上传文件</el-button>
    </template>

    <!-- 筛选区：文件名搜索 -->
    <template #filter>
      <el-input
        v-model="filter.originalName"
        placeholder="文件名"
        clearable
        style="width: 240px"
        @keyup.enter="handleQuery"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 表格 -->
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="originalName" label="文件名" min-width="200" show-overflow-tooltip />
      <el-table-column label="大小" width="100" align="right">
        <template #default="{ row }">
          {{ formatFileSize(row.fileSize) }}
        </template>
      </el-table-column>
      <el-table-column prop="fileExt" label="类型" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.fileExt.toUpperCase() }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contentType" label="MIME" width="160" show-overflow-tooltip />
      <el-table-column label="存储方式" width="90" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="providerTagType(row.providerType)">
            {{ providerLabel(row.providerType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" label="上传时间" width="170" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="downloadRow(row)">下载</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openUpload">上传文件</el-button>
    </template>
  </StandardListTemplate>

  <!-- 上传弹窗 -->
  <el-dialog
    v-model="uploadDialogVisible"
    title="上传文件"
    :close-on-click-modal="false"
    destroy-on-close
    width="480px"
    @closed="closeUpload"
  >
    <el-alert
      v-if="uploadError"
      :title="uploadError"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />
    <div style="display: flex; flex-direction: column; gap: 12px">
      <input type="file" style="display: block" @change="onFileChange" />
    </div>
    <template #footer>
      <el-button @click="closeUpload">取消</el-button>
      <el-button
        type="primary"
        :loading="uploading"
        :disabled="!uploadFileRef"
        @click="handleUpload"
      >
        上传
      </el-button>
    </template>
  </el-dialog>
</template>
