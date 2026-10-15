<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import {
  assignFormMembership,
  createFormAppDir,
  deleteFormAppDir,
  getFormAppContent,
  listFormApps,
  updateFormAppDir,
} from '@/modules/form/api/app-center'
import { createFormDef, saveFormConfig } from '@/modules/form/api/form-def'
import { disableFormDef, enableFormDef } from '@/modules/form/api/i2-choices'
import type { FormApp, FormAppContent, FormAppFormItem } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId))

const content = ref<FormAppContent | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const dirs = computed(() => content.value?.dirs ?? [])
const directForms = computed(() => content.value?.directForms ?? [])
const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && dirs.value.length === 0 && directForms.value.length === 0,
)

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    content.value = await getFormAppContent(appId.value)
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    errorMsg.value = getErrorMessage(errObj.code ?? 0, errObj.message)
    content.value = null
  } finally {
    loading.value = false
  }
}

// ==================== 目录 ====================

const dirDialogVisible = ref(false)
const editingDirId = ref<string | null>(null)
const dirForm = reactive({ name: '', sortNo: 0 })
const dirSaving = ref(false)

const dirDialogTitle = computed(() =>
  editingDirId.value ? t('form.appCenter.editDir') : t('form.appCenter.newDir'),
)

function openCreateDir() {
  editingDirId.value = null
  Object.assign(dirForm, { name: '', sortNo: 0 })
  dirDialogVisible.value = true
}

function openEditDir(dir: { id: string; name: string; sortNo: number }) {
  editingDirId.value = dir.id
  Object.assign(dirForm, { name: dir.name, sortNo: dir.sortNo ?? 0 })
  dirDialogVisible.value = true
}

async function handleSaveDir() {
  const name = dirForm.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  dirSaving.value = true
  try {
    if (editingDirId.value) {
      await updateFormAppDir(editingDirId.value, { name, sortNo: dirForm.sortNo })
    } else {
      await createFormAppDir(appId.value, { name, sortNo: dirForm.sortNo })
    }
    ElMessage.success(t('common.saveSuccess'))
    dirDialogVisible.value = false
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    dirSaving.value = false
  }
}

async function handleDeleteDir(dir: { id: string; name: string }) {
  try {
    await ElMessageBox.confirm(
      t('form.appCenter.deleteDirConfirm', { name: dir.name }),
      t('common.deleteConfirmTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteFormAppDir(dir.id)
    ElMessage.success(t('common.deleteSuccess'))
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

// ==================== 表单 ====================

const formDialogVisible = ref(false)
const formSaving = ref(false)
const formTarget = reactive<{ dirId: string | null }>({ dirId: null })
const newForm = reactive({ name: '' })

function openCreateForm(dirId: string | null) {
  formTarget.dirId = dirId
  newForm.name = ''
  formDialogVisible.value = true
}

async function handleCreateForm() {
  const name = newForm.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  formSaving.value = true
  try {
    const formKey = `form_${Date.now().toString(36)}`
    const created = await createFormDef({
      formKey,
      name,
      formType: 'BUSINESS',
      appId: appId.value,
      dirId: formTarget.dirId,
    })
    // 空 definition 先落一份：设计器 GET /definition 对无定义草稿返回 CONFIG_NOT_FOUND
    await saveFormConfig(created.id, JSON.stringify({ title: name, fields: [] }))
    ElMessage.success(t('form.appCenter.formCreated'))
    formDialogVisible.value = false
    void router.push({
      name: 'form-app-manage-form',
      params: { appId: appId.value, formId: created.id },
    })
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    formSaving.value = false
  }
}

function enterForm(item: FormAppFormItem) {
  void router.push({
    name: 'form-app-manage-form',
    params: { appId: appId.value, formId: item.formId },
  })
}

async function toggleFormStatus(item: FormAppFormItem) {
  const disabling = item.status === 'PUBLISHED'
  try {
    await ElMessageBox.confirm(
      disabling ? t('form.appCenter.disableFormConfirm') : t('form.appCenter.enableFormConfirm'),
      t('common.confirm'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    if (disabling) {
      await disableFormDef(item.formId)
    } else {
      await enableFormDef(item.formId)
    }
    ElMessage.success(t('common.saveSuccess'))
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

// ==================== 归属调整 ====================

const moveDialogVisible = ref(false)
const movingForm = ref<FormAppFormItem | null>(null)
const moveTarget = reactive<{ appId: string; dirId: string }>({ appId: '', dirId: '' })
const moveApps = ref<FormApp[]>([])
const moveDirs = ref<{ id: string; name: string }[]>([])
const moveSaving = ref(false)

async function openMove(item: FormAppFormItem) {
  movingForm.value = item
  moveTarget.appId = appId.value
  moveTarget.dirId = item.dirId ?? ''
  moveDialogVisible.value = true
  try {
    const apps = await listFormApps()
    moveApps.value = apps.filter((a) => a.status === 'ENABLED')
    await loadMoveDirs()
  } catch {
    moveApps.value = []
    moveDirs.value = []
  }
}

async function loadMoveDirs() {
  moveDirs.value = []
  if (!moveTarget.appId) return
  if (moveTarget.appId === appId.value) {
    moveDirs.value = dirs.value.map((d) => ({ id: d.id, name: d.name }))
    return
  }
  try {
    const target = await getFormAppContent(moveTarget.appId)
    moveDirs.value = target.dirs.map((d) => ({ id: d.id, name: d.name }))
  } catch {
    moveDirs.value = []
  }
}

async function handleMove() {
  if (!movingForm.value || !moveTarget.appId) return
  moveSaving.value = true
  try {
    await assignFormMembership(movingForm.value.formId, {
      appId: moveTarget.appId,
      dirId: moveTarget.dirId || null,
    })
    ElMessage.success(t('common.saveSuccess'))
    moveDialogVisible.value = false
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    moveSaving.value = false
  }
}

// ==================== 展示辅助 ====================

function statusLabel(status: FormAppFormItem['status']): string {
  switch (status) {
    case 'PUBLISHED':
      return t('form.appCenter.formStatusPublished')
    case 'DISABLED':
      return t('form.appCenter.formStatusDisabled')
    default:
      return t('form.appCenter.formStatusDraft')
  }
}

function statusTagType(status: FormAppFormItem['status']): 'success' | 'info' | 'warning' {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'DISABLED') return 'info'
  return 'warning'
}

function formActions(r: unknown): ListAction[] {
  const item = r as FormAppFormItem
  const actions: ListAction[] = [
    { key: 'enter', label: t('form.appCenter.enterForm'), onClick: () => enterForm(item) },
    { key: 'move', label: t('form.appCenter.moveForm'), onClick: () => void openMove(item) },
  ]
  if (item.status === 'PUBLISHED') {
    actions.push({
      key: 'disable',
      label: t('form.appCenter.disable'),
      type: 'warning',
      onClick: () => void toggleFormStatus(item),
    })
  } else if (item.status === 'DISABLED') {
    actions.push({
      key: 'enable',
      label: t('form.appCenter.enable'),
      onClick: () => void toggleFormStatus(item),
    })
  }
  return actions
}

function backToList() {
  void router.push({ name: 'form-app-manage' })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <StandardListTemplate
    :title="content?.app.name ?? t('form.appCenter.workspaceTitle')"
    :show-toolbar-total="true"
    :total="dirs.length + directForms.length"
    :page-num="1"
    :page-size="dirs.length + directForms.length || 10"
    :empty="isEmpty"
  >
    <template #toolbar-actions>
      <AppIcon v-if="content" :icon="content.app.icon" :color="content.app.color" :size="16" />
      <el-tag v-if="content?.app.status === 'DISABLED'" type="info" size="small">
        {{ t('form.appCenter.statusDisabled') }}
      </el-tag>
      <el-button v-perm="'form:app:manage'" @click="backToList">
        {{ t('form.appCenter.backToList') }}
      </el-button>
      <el-button v-perm="'form:app:manage'" data-testid="dir-create" @click="openCreateDir">
        {{ t('form.appCenter.newDir') }}
      </el-button>
      <el-button
        v-perm="'form:app:manage'"
        type="primary"
        data-testid="form-create"
        @click="openCreateForm(null)"
      >
        {{ t('form.appCenter.newFormInApp') }}
      </el-button>
    </template>

    <div v-loading="loading" class="app-workspace">
      <div v-if="errorMsg" class="app-workspace__error">{{ errorMsg }}</div>

      <!-- 目录（二级分类） -->
      <el-card v-for="dir in dirs" :key="dir.id" class="dir-card" shadow="never">
        <div class="dir-card__head">
          <span class="dir-card__title" data-testid="dir-name">{{ dir.name }}</span>
          <span class="dir-card__count">{{
            t('form.appCenter.formCount', { count: dir.formCount ?? 0 })
          }}</span>
          <div class="dir-card__actions">
            <el-button v-perm="'form:app:manage'" link type="primary" @click="openEditDir(dir)">
              {{ t('common.edit') }}
            </el-button>
            <el-button v-perm="'form:app:manage'" link type="danger" @click="handleDeleteDir(dir)">
              {{ t('common.delete') }}
            </el-button>
            <el-button
              v-perm="'form:app:manage'"
              link
              type="primary"
              @click="openCreateForm(dir.id)"
            >
              {{ t('form.appCenter.newFormInDir') }}
            </el-button>
          </div>
        </div>
        <el-table :data="dir.forms ?? []" size="small" style="width: 100%">
          <el-table-column prop="name" :label="t('form.appCenter.colFormName')" min-width="200" />
          <el-table-column prop="formKey" :label="t('form.appCenter.colFormKey')" min-width="160" />
          <el-table-column :label="t('form.appCenter.colFormStatus')" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{
                statusLabel(row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="200" fixed="right">
            <template #default>
              <ListActionsColumn :actions="formActions" :width="200" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 应用内直接归属表单 -->
      <el-card class="dir-card" shadow="never">
        <div class="dir-card__head">
          <span class="dir-card__title">{{ t('form.appCenter.directForms') }}</span>
          <span class="dir-card__count">{{
            t('form.appCenter.formCount', { count: directForms.length })
          }}</span>
        </div>
        <el-table :data="directForms" size="small" style="width: 100%">
          <el-table-column prop="name" :label="t('form.appCenter.colFormName')" min-width="200" />
          <el-table-column prop="formKey" :label="t('form.appCenter.colFormKey')" min-width="160" />
          <el-table-column :label="t('form.appCenter.colFormStatus')" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{
                statusLabel(row.status)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="200" fixed="right">
            <template #default>
              <ListActionsColumn :actions="formActions" :width="200" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <template #empty-action>
      <el-button v-perm="'form:app:manage'" @click="openCreateDir">
        {{ t('form.appCenter.newDir') }}
      </el-button>
      <el-button v-perm="'form:app:manage'" type="primary" @click="openCreateForm(null)">
        {{ t('form.appCenter.newFormInApp') }}
      </el-button>
    </template>
  </StandardListTemplate>

  <!-- 目录对话框 -->
  <el-dialog v-model="dirDialogVisible" :title="dirDialogTitle" width="420px">
    <el-form label-width="80px">
      <el-form-item :label="t('form.appCenter.fieldName')" required>
        <el-input v-model="dirForm.name" data-testid="dir-name-input" maxlength="100" />
      </el-form-item>
      <el-form-item :label="t('form.appCenter.fieldSort')">
        <el-input-number v-model="dirForm.sortNo" :min="0" :max="9999" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dirDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="dirSaving" @click="handleSaveDir">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 新建表单对话框 -->
  <el-dialog v-model="formDialogVisible" :title="t('form.appCenter.newForm')" width="420px">
    <el-form label-width="80px">
      <el-form-item :label="t('form.appCenter.fieldName')" required>
        <el-input v-model="newForm.name" data-testid="form-name-input" maxlength="200" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="formDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="formSaving" @click="handleCreateForm">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 归属调整对话框 -->
  <el-dialog v-model="moveDialogVisible" :title="t('form.appCenter.moveForm')" width="420px">
    <el-form label-width="80px">
      <el-form-item :label="t('form.appCenter.moveTargetApp')">
        <el-select v-model="moveTarget.appId" style="width: 100%" @change="loadMoveDirs">
          <el-option v-for="a in moveApps" :key="a.id" :label="a.name" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('form.appCenter.moveTargetDir')">
        <el-select v-model="moveTarget.dirId" clearable style="width: 100%">
          <el-option :label="t('form.appCenter.directForms')" value="" />
          <el-option v-for="d in moveDirs" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="moveDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="moveSaving" @click="handleMove">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.app-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 80px;
}
.app-workspace__error {
  color: #f56c6c;
  padding: 12px 0;
}
.dir-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.dir-card__title {
  font-weight: 600;
  color: #303133;
}
.dir-card__count {
  font-size: 13px;
  color: #909399;
}
.dir-card__actions {
  margin-left: auto;
}
</style>
