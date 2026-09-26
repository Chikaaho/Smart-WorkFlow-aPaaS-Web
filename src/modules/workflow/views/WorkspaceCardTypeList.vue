<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  createWorkspaceCardType,
  deleteWorkspaceCardType,
  listWorkspaceCardTypesForManage,
  updateWorkspaceCardType,
  type WorkspaceCardTypeSaveReq,
} from '@/modules/workflow/api/oa'
import type { WorkspaceCardType, WorkspaceRendererKey } from '@/contracts/catalog'
import { ApiError } from '@/foundation/request'
import { useI18n } from '@/locales'

const { t } = useI18n()

const list = ref<WorkspaceCardType[]>([])
const loading = ref(false)
const errorMsg = ref('')
const dialogVisible = ref(false)
const editing = ref<WorkspaceCardType | null>(null)
const saving = ref(false)

const rendererOptions: Array<{ value: WorkspaceRendererKey; label: string }> = [
  { value: 'stats', label: t('workflow.workspaceCardTypeRendererStats') },
  { value: 'todo', label: t('workflow.workspaceCardTypeRendererTodo') },
  { value: 'favorites', label: t('workflow.workspaceCardTypeRendererFavorites') },
  { value: 'activity', label: t('workflow.workspaceCardTypeRendererActivity') },
  { value: 'efficiency', label: t('workflow.workspaceCardTypeRendererEfficiency') },
  { value: 'drafts', label: t('workflow.workspaceCardTypeRendererDrafts') },
  { value: 'messages', label: t('workflow.workspaceCardTypeRendererMessages') },
]

const form = reactive<WorkspaceCardTypeSaveReq>({
  typeCode: '',
  displayName: '',
  rendererKey: 'todo',
  metadataJson: '{}',
  defaultSpan: 1,
  defaultOrder: 1,
  status: 0,
})

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    list.value = await listWorkspaceCardTypesForManage()
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.workspaceCardTypeLoadFailed')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.typeCode = ''
  form.displayName = ''
  form.rendererKey = 'todo'
  form.metadataJson = '{}'
  form.defaultSpan = 1
  form.defaultOrder = list.value.length + 1
  form.status = 0
}

function openCreate() {
  editing.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: WorkspaceCardType) {
  editing.value = row
  form.typeCode = row.typeCode
  form.displayName = row.displayName
  form.rendererKey = row.rendererKey
  form.metadataJson = row.metadataJson || '{}'
  form.defaultSpan = row.defaultSpan
  form.defaultOrder = row.defaultOrder
  form.status = row.status
  dialogVisible.value = true
}

function parseMetadata(): boolean {
  try {
    const parsed = JSON.parse(form.metadataJson || '{}') as unknown
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') return false
    form.metadataJson = JSON.stringify(parsed)
    return true
  } catch {
    return false
  }
}

async function submit() {
  if (!form.typeCode.trim() || !form.displayName.trim()) {
    ElMessage.warning(t('common.mustBeNonEmptyString'))
    return
  }
  if (!parseMetadata()) {
    ElMessage.warning(t('workflow.workspaceCardTypeInvalidJson'))
    return
  }
  saving.value = true
  try {
    const payload = {
      ...form,
      typeCode: form.typeCode.trim(),
      displayName: form.displayName.trim(),
    }
    if (editing.value) {
      await updateWorkspaceCardType(editing.value.id, payload)
      ElMessage.success(t('workflow.workspaceCardTypeUpdated'))
    } else {
      await createWorkspaceCardType(payload)
      ElMessage.success(t('workflow.workspaceCardTypeCreated'))
    }
    dialogVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceCardTypeSaveFailed'))
  } finally {
    saving.value = false
  }
}

async function remove(row: WorkspaceCardType) {
  try {
    await ElMessageBox.confirm(
      t('workflow.workspaceCardTypeDeleteConfirm', { name: row.displayName }),
      t('common.deleteConfirmTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteWorkspaceCardType(row.id)
    ElMessage.success(t('workflow.workspaceCardTypeDeleted'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceCardTypeDeleteFailed'))
  }
}

function rendererLabel(value: WorkspaceRendererKey): string {
  return rendererOptions.find((option) => option.value === value)?.label ?? value
}

function asCardType(row: unknown): WorkspaceCardType {
  return row as WorkspaceCardType
}

/** 操作列（V012-BUG-002）：编辑 / 删除 */
function rowActions(row: unknown): ListAction[] {
  const item = asCardType(row)
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      type: 'primary',
      onClick: () => openEdit(item),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => void remove(item),
    },
  ]
}

// ─── 客户端分页（V012-BUG-003）：管理列表一次拉全量，前端切片 ───
const pageNum = ref(1)
const pageSize = ref(10)

const pagedList = computed(() =>
  list.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value),
)

function handlePageNumChange(p: number) {
  pageNum.value = p
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
}

onMounted(() => void loadList())
</script>

<template>
  <StandardListTemplate
    :title="t('workflow.workspaceCardTypesTitle')"
    :total="list.length"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="!loading && !errorMsg && list.length === 0"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">{{
        t('workflow.newWorkspaceCardType')
      }}</el-button>
    </template>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />
    <el-table v-loading="loading" :data="pagedList" stripe style="width: 100%">
      <el-table-column prop="displayName" :label="t('common.name')" min-width="140" />
      <el-table-column
        prop="typeCode"
        :label="t('workflow.workspaceCardTypeCode')"
        min-width="150"
      />
      <el-table-column :label="t('workflow.workspaceCardTypeRenderer')" min-width="140">
        <template #default="{ row }">{{ rendererLabel(asCardType(row).rendererKey) }}</template>
      </el-table-column>
      <el-table-column
        prop="defaultOrder"
        :label="t('workflow.workspaceCardTypeOrder')"
        width="100"
      />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 0 ? 'success' : 'info'" size="small">
            {{
              row.status === 0
                ? t('workflow.workspaceCardTypeEnabled')
                : t('workflow.workspaceCardTypeDisabled')
            }}
          </el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>
  </StandardListTemplate>

  <el-dialog
    v-model="dialogVisible"
    :title="editing ? t('workflow.editWorkspaceCardType') : t('workflow.newWorkspaceCardType')"
    width="560px"
  >
    <el-form label-width="110px">
      <el-form-item :label="t('workflow.workspaceCardTypeCode')">
        <el-input
          v-model="form.typeCode"
          :disabled="Boolean(editing)"
          :placeholder="t('workflow.workspaceCardTypeCodePlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('common.name')">
        <el-input v-model="form.displayName" />
      </el-form-item>
      <el-form-item :label="t('workflow.workspaceCardTypeRenderer')">
        <el-select v-model="form.rendererKey" style="width: 100%">
          <el-option
            v-for="option in rendererOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('workflow.workspaceCardTypeMetadata')">
        <el-input
          v-model="form.metadataJson"
          type="textarea"
          :rows="5"
          :placeholder="t('workflow.workspaceCardTypeMetadataPlaceholder')"
        />
      </el-form-item>
      <el-form-item :label="t('workflow.workspaceCardTypeOrder')">
        <el-input-number v-model="form.defaultOrder" :min="1" :max="9999" />
      </el-form-item>
      <el-form-item :label="t('workflow.workspaceCardTypeSpan')">
        <el-radio-group v-model="form.defaultSpan">
          <el-radio :value="1">{{ t('workflow.halfWidth') }}</el-radio>
          <el-radio :value="2">{{ t('workflow.fullWidth') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('common.status')">
        <el-switch v-model="form.status" :active-value="0" :inactive-value="1" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>
