<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyTemplateList — 消息模板管理列表页（P36 / M05-F02-01）。
 *
 * 分页 + 关键字（代码/名称）查询 + 启停过滤；表格展示代码/名称/标题模板/
 * 启停/更新时间/操作（编辑、启停、删除、预览）。
 * 新建/编辑使用 NotifyTemplateFormDialog；预览弹窗内变量替换由后端
 * preview 接口完成（与真实发送同源，前端不做替换逻辑，防双规则漂移）。
 *
 * 权限：菜单路由 notify:template:view；新建/编辑/删除/启停 notify:template:manage。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import {
  pageNotifyTemplates,
  deleteNotifyTemplate,
  toggleNotifyTemplate,
  previewTemplate,
} from '@/modules/notify/api'
import type { NotifyTemplate } from '@/contracts/notify'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'
import NotifyTemplateFormDialog from './NotifyTemplateFormDialog.vue'

const { hasPerm } = usePermission()

// ─── 列表状态 ───

const loading = ref(false)
const errorMsg = ref('')
const list = ref<NotifyTemplate[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const filter = reactive({ keyword: '', enabled: undefined as boolean | undefined })
const currentKeyword = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)
const canManage = computed(() => hasPerm('notify:template:manage'))

// ─── 数据加载 ───

async function loadTemplates() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageNotifyTemplates(
      page,
      currentKeyword.value || undefined,
      filter.enabled,
    )
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('notify.templateListLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = filter.keyword.trim()
  pageNum.value = 1
  void loadTemplates()
}

function handleReset() {
  filter.keyword = ''
  filter.enabled = undefined
  currentKeyword.value = ''
  pageNum.value = 1
  void loadTemplates()
}

function handlePageNumChange(page: number) {
  pageNum.value = page
  void loadTemplates()
}

function handlePageSizeChange(size: number) {
  pageSize.value = size
  pageNum.value = 1
  void loadTemplates()
}

onMounted(() => void loadTemplates())

// ─── 新建/编辑弹窗 ───

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)

function openCreate() {
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(row: NotifyTemplate) {
  editingId.value = row.id
  dialogVisible.value = true
}

function handleSaved() {
  void loadTemplates()
}

// ─── 启停 ───

async function handleToggle(row: NotifyTemplate) {
  if (!canManage.value) return
  const target = !row.enabled
  try {
    await ElMessageBox.confirm(
      target
        ? t('notify.confirmEnableTemplate', { name: row.name })
        : t('notify.confirmDisableTemplate'),
      target ? t('notify.enableTemplate') : t('notify.disableTemplate'),
      {
        get confirmButtonText() {
          return t('common.confirm')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await toggleNotifyTemplate(row.id, target)
    ElMessage.success(target ? t('common.statusEnabled') : t('common.statusDisabled'))
    void loadTemplates()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('notify.toggleFailed'))
  }
}

// ─── 删除 ───

async function handleDelete(row: NotifyTemplate) {
  if (!canManage.value) return
  try {
    await ElMessageBox.confirm(t('notify.confirmDeleteTemplate'), t('notify.deleteTemplate'), {
      get confirmButtonText() {
        return t('common.delete')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteNotifyTemplate(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    void loadTemplates()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.deleteFailed'))
  }
}

// ─── 预览弹窗（渲染由后端完成，前端不做替换逻辑） ───

const previewVisible = ref(false)
const previewRow = ref<NotifyTemplate | null>(null)
const previewVarsText = ref('{}')
const previewResult = ref<{ title: string; content: string } | null>(null)
const previewError = ref('')
const previewLoading = ref(false)

function openPreview(row: NotifyTemplate) {
  previewRow.value = row
  previewVarsText.value = '{}'
  previewResult.value = null
  previewError.value = ''
  previewVisible.value = true
}

async function runPreview() {
  if (!previewRow.value) return
  let variables: Record<string, string>
  try {
    variables = JSON.parse(previewVarsText.value)
  } catch {
    previewError.value = t('notify.variablesJsonInvalid')
    return
  }
  previewLoading.value = true
  previewError.value = ''
  previewResult.value = null
  try {
    previewResult.value = await previewTemplate({
      titleTemplate: previewRow.value.titleTemplate,
      contentTemplate: previewRow.value.contentTemplate,
      variables,
    })
  } catch (err) {
    previewError.value = err instanceof ApiError ? err.msg : t('notify.previewFailed')
  } finally {
    previewLoading.value = false
  }
}

defineExpose({ list, errorMsg, retryLoad: loadTemplates })
</script>

<template>
  <StandardListTemplate
    :title="t('router.messageTemplate')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="openCreate">{{
        t('notify.newTemplate')
      }}</el-button>
    </template>

    <template #filter>
      <el-input
        v-model="filter.keyword"
        :placeholder="t('notify.searchTemplatePlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="handleQuery"
        @clear="handleQuery"
      />
      <el-select
        v-model="filter.enabled"
        :placeholder="t('common.allStatuses')"
        clearable
        style="width: 130px"
        @change="handleQuery"
      >
        <el-option :label="t('common.enable')" :value="true" />
        <el-option :label="t('common.disable')" :value="false" />
      </el-select>
    </template>

    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="templateCode" :label="t('notify.templateCode')" min-width="140" />
      <el-table-column prop="name" :label="t('common.name')" min-width="140" />
      <el-table-column
        prop="titleTemplate"
        :label="t('notify.titleTemplate')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag :type="(row as NotifyTemplate).enabled ? 'success' : 'info'" size="small">
            {{ (row as NotifyTemplate).enabled ? t('common.enable') : t('common.disable') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" :label="t('common.updateTime')" width="180" />
      <el-table-column :label="t('common.actions')" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openPreview(row as NotifyTemplate)">
            {{ t('common.preview') }}
          </el-button>
          <template v-if="canManage">
            <el-button size="small" link type="primary" @click="openEdit(row as NotifyTemplate)">{{
              t('common.edit')
            }}</el-button>
            <el-button
              size="small"
              link
              :type="(row as NotifyTemplate).enabled ? 'warning' : 'success'"
              @click="handleToggle(row as NotifyTemplate)"
            >
              {{ (row as NotifyTemplate).enabled ? t('common.disable') : t('common.enable') }}
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              @click="handleDelete(row as NotifyTemplate)"
              >{{ t('common.delete') }}</el-button
            >
          </template>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <NotifyTemplateFormDialog
    v-model:visible="dialogVisible"
    :template-id="editingId"
    @saved="handleSaved"
  />

  <!-- 预览弹窗 -->
  <el-dialog
    v-model="previewVisible"
    :title="t('notify.previewDialogTitle', { name: previewRow?.name ?? '' })"
    width="640px"
    destroy-on-close
  >
    <div class="preview-body">
      <div class="form-field">
        <label class="form-field__label">{{ t('notify.previewVariablesLabel') }}</label>
        <el-input
          v-model="previewVarsText"
          type="textarea"
          :rows="4"
          :placeholder="t('notify.templateVarsPlaceholder')"
          style="font-family: monospace"
        />
      </div>
      <el-alert
        v-if="previewError"
        :title="previewError"
        type="error"
        :closable="false"
        show-icon
      />
      <template v-if="previewResult">
        <div class="preview-result">
          <div class="preview-result__item">
            <label>{{ t('common.title') }}</label>
            <span>{{ previewResult.title }}</span>
          </div>
          <div class="preview-result__item">
            <label>{{ t('notify.bodyLabel') }}</label>
            <span>{{ previewResult.content }}</span>
          </div>
        </div>
        <el-text size="small" type="info">{{ t('notify.previewSameRendererNote') }}</el-text>
      </template>
    </div>
    <template #footer>
      <el-button @click="previewVisible = false">{{ t('common.close') }}</el-button>
      <el-button type="primary" :loading="previewLoading" @click="runPreview">{{
        t('notify.renderPreview')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-body {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

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

.preview-result {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}

.preview-result__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--sw-space-8) var(--sw-space-12);
  background: var(--sw-bg-secondary);
  border-radius: 6px;
}

.preview-result__item label {
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
</style>
