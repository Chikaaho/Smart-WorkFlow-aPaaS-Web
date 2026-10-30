<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Folder, Plus } from '@element-plus/icons-vue'
import AppContentPanel from '@/modules/form/components/AppContentPanel.vue'
import AppTreeNav from '@/modules/form/components/AppTreeNav.vue'
import {
  createFormAppDir,
  deleteFormAppDir,
  getFormAppContent,
  updateFormAppDir,
} from '@/modules/form/api/app-center'
import { deleteFormDef, renameFormDef } from '@/modules/form/api/form-def'
import type { FormAppContent, FormAppFormItem } from '@/contracts/app-center'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'

/**
 * 应用详情 / 应用工作台（0.1.7 #4）：
 * 去掉通用侧边栏（BasicLayout 对 /form/app-manage/:appId 隐藏），改为应用专属侧边栏——
 * 与用户端应用内页同一棵目录/表单树，多一个左下角「新建」（目录 / 表单）；
 * 目录与表单行尾三个点：修改（仅名称）/ 删除，目录多一项「新建表单」。
 * 新建表单只收集名称、不落库——进入设计器新建态，首次保存才创建记录（回归01b）。
 * 树点击表单 → 右侧展示其数据列表（回归01c：点行看数据，数据列表不能丢）；
 * 「表单设计」入口在表单行三点菜单里（已发布表单同样可改，配合 #14 保存+发布新版本）。
 * 空应用中间只展示「暂无数据」，不渲染其它噪音。
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId))

const content = ref<FormAppContent | null>(null)
const loading = ref(false)
const errorMsg = ref('')

const dirs = computed(() => content.value?.dirs ?? [])
const directForms = computed(() => content.value?.directForms ?? [])
const allForms = computed<FormAppFormItem[]>(() => {
  const forms: FormAppFormItem[] = []
  for (const dir of dirs.value) forms.push(...(dir.forms ?? []))
  forms.push(...directForms.value)
  return forms
})
/** 应用身份（0.1.7 #34）：左上角图标 + 名称来自应用内容接口，不额外请求。 */
const app = computed(() => content.value?.app ?? null)

const isEmpty = computed(() => !loading.value && !errorMsg.value && allForms.value.length === 0)

/** 当前选中表单：query.formKey 命中则用之，否则回落首个表单（与用户端应用内页一致）。 */
const selectedFormKey = computed(() => {
  const fromQuery = typeof route.query.formKey === 'string' ? route.query.formKey : ''
  if (fromQuery && allForms.value.some((form) => form.formKey === fromQuery)) return fromQuery
  return allForms.value[0]?.formKey ?? ''
})

/** 目录/应用被后台调整后回到首个可选表单，避免停留在已移除的表单上。 */
watch(allForms, (forms) => {
  const fromQuery = typeof route.query.formKey === 'string' ? route.query.formKey : ''
  if (fromQuery && !forms.some((form) => form.formKey === fromQuery)) {
    void router.replace({ query: { ...route.query, formKey: forms[0]?.formKey ?? undefined } })
  }
})

/** 树点击表单 → 右侧展示数据列表（回归01c：点行看数据）。 */
function selectForm(item: FormAppFormItem) {
  void router.replace({ query: { ...route.query, formKey: item.formKey } })
}

/** 表单设计 → 设计器（回归01c：修改入口收进三点菜单）。 */
function enterFormDesigner(item: FormAppFormItem) {
  void router.push({
    path: `/form/designer/${item.formId}`,
    query: { from: 'app-form', appId: appId.value },
  })
}

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

function backToList() {
  void router.push({ name: 'form-app-manage' })
}

// ==================== 新建（左下角入口） ====================

function onCreateCommand(command: string) {
  if (command === 'dir') openCreateDir()
  if (command === 'form') openCreateForm(null)
}

// ==================== 目录 ====================

const dirDialogVisible = ref(false)
const editingDirId = ref<string | null>(null)
/* Q34（272:1698）：上级目录为本地选择字段，不参与创建请求（API 仍只收名称/排序） */
const dirForm = reactive({ name: '', sortNo: 0, parentId: '' })
const dirSaving = ref(false)

const dirDialogTitle = computed(() =>
  editingDirId.value ? t('form.appCenter.editDir') : t('form.appCenter.newDir'),
)

function openCreateDir() {
  editingDirId.value = null
  Object.assign(dirForm, { name: '', sortNo: 0, parentId: '' })
  dirDialogVisible.value = true
}

function openRenameDir(dir: { id: string; name: string; sortNo: number }) {
  editingDirId.value = dir.id
  Object.assign(dirForm, { name: dir.name, sortNo: dir.sortNo ?? 0, parentId: '' })
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

function onDirCommand(command: string, dir: { id: string; name: string; sortNo: number }) {
  if (command === 'rename') {
    openRenameDir(dir)
    return
  }
  if (command === 'form') {
    openCreateForm(dir.id)
    return
  }
  if (command === 'delete') {
    void handleDeleteDir(dir)
  }
}

async function handleDeleteDir(dir: { id: string; name: string }) {
  try {
    await ElMessageBox.confirm(
      t('form.appCenter.deleteDirConfirm', { name: dir.name }),
      t('common.deleteConfirmTitle'),
      {
        customClass: 'sw-delete-confirm',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
      },
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
const formTarget = reactive<{ dirId: string | null }>({ dirId: null })
const newForm = reactive({ name: '' })

function openCreateForm(dirId: string | null) {
  formTarget.dirId = dirId
  newForm.name = ''
  formDialogVisible.value = true
}

function handleCreateForm() {
  const name = newForm.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  // 回归01b：对话框只收集名称，不创建记录；设计器新建态首次保存才落库
  // （携带应用/目录与预填名称，用户放弃设计则不产生任何记录）
  const query: Record<string, string> = {
    from: 'app-form',
    appId: appId.value,
    pendingName: name,
  }
  if (formTarget.dirId) query.dirId = formTarget.dirId
  formDialogVisible.value = false
  void router.push({ path: '/form/designer', query })
}

// ==================== 表单改名 / 删除 ====================

const renameDialogVisible = ref(false)
const renameSaving = ref(false)
const renameTarget = reactive<{ formId: string; name: string }>({ formId: '', name: '' })

function openRenameForm(item: FormAppFormItem) {
  renameTarget.formId = item.formId
  renameTarget.name = item.name
  renameDialogVisible.value = true
}

async function handleRenameForm() {
  const name = renameTarget.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  renameSaving.value = true
  try {
    await renameFormDef(renameTarget.formId, name)
    ElMessage.success(t('common.saveSuccess'))
    renameDialogVisible.value = false
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    renameSaving.value = false
  }
}

function onFormCommand(command: string, item: FormAppFormItem) {
  if (command === 'design') {
    enterFormDesigner(item)
    return
  }
  if (command === 'rename') {
    openRenameForm(item)
    return
  }
  if (command === 'delete') {
    void handleDeleteForm(item)
  }
}

async function handleDeleteForm(item: FormAppFormItem) {
  try {
    await ElMessageBox.confirm(
      t('form.appCenter.deleteFormConfirm', { name: item.name }),
      t('common.deleteConfirmTitle'),
      {
        customClass: 'sw-delete-confirm',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }
  try {
    await deleteFormDef(item.formId)
    ElMessage.success(t('common.deleteSuccess'))
    await load()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="app-ws">
    <div v-if="errorMsg" class="app-ws__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-ws__body">
      <!-- 应用专属侧边栏：返回箭头 + 应用身份 + 目录/表单树 + 左下角新建 -->
      <AppTreeNav
        :dirs="dirs"
        :direct-forms="directForms"
        :selected-form-key="selectedFormKey"
        :app-name="app?.name"
        :app-icon="app?.icon"
        :app-color="app?.color"
        :back-title="t('form.appCenter.backToList')"
        back-test-id="app-back"
        name-test-id="app-ws-name"
        @select="selectForm"
        @back="backToList"
        @dir-command="onDirCommand"
        @form-command="onFormCommand"
      >
        <template #footer>
          <!-- 273:1773（执行提示28 项1）：底部新建菜单 192 宽/项 36 高/带原图标；sw-op-menu 样式根在 AppTreeNav 全局块 -->
          <el-dropdown
            v-perm="'form:app:manage'"
            trigger="click"
            popper-class="sw-op-menu"
            @command="onCreateCommand"
          >
            <el-button class="app-ws__create" data-testid="app-ws-create" :icon="Plus">
              {{ t('form.appCenter.createAction') }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="dir" data-testid="dir-create">
                  <el-icon><Folder /></el-icon>{{ t('form.appCenter.newDir') }}
                </el-dropdown-item>
                <el-dropdown-item command="form" data-testid="form-create">
                  <el-icon><Document /></el-icon>{{ t('form.appCenter.newForm') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </AppTreeNav>

      <!-- 右侧内容：空应用 / 未选择目录或表单均用大图标占位；选中表单展示其数据列表（回归01c） -->
      <AppContentPanel
        :form-key="selectedFormKey"
        :app-id="appId"
        :is-empty="isEmpty"
        empty-test-id="app-ws-empty"
        placeholder-test-id="app-ws-placeholder"
      />
    </div>

    <!-- 目录新建/改名对话框（0.1.7 #4：修改只改名称）。
         Q34（272:1698）：新建态 540 宽，目录名称 + 上级目录两字段（上级目录只本地选择、默认无）；
         改名态保持既有单名称表单。 -->
    <el-dialog
      v-model="dirDialogVisible"
      :title="dirDialogTitle"
      width="540px"
      class="ws-dir-dialog"
    >
      <template v-if="!editingDirId">
        <div class="ws-dialog-field">
          <label class="ws-dialog-field__label ws-dialog-field__label--required">{{
            t('form.appCenter.dirNameLabel')
          }}</label>
          <el-input
            v-model="dirForm.name"
            data-testid="dir-name-input"
            maxlength="100"
            :placeholder="t('common.namePlaceholder')"
          />
        </div>
        <div class="ws-dialog-field">
          <label class="ws-dialog-field__label">{{ t('form.appCenter.parentDirLabel') }}</label>
          <el-select v-model="dirForm.parentId" data-testid="dir-parent-select">
            <el-option :value="''" :label="t('form.appCenter.parentDirNone')" />
            <el-option v-for="dir in dirs" :key="dir.id" :value="dir.id" :label="dir.name" />
          </el-select>
        </div>
      </template>
      <el-form v-else label-width="80px">
        <el-form-item :label="t('form.appCenter.fieldName')" required>
          <el-input v-model="dirForm.name" data-testid="dir-name-input" maxlength="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dirDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="dirSaving" @click="handleSaveDir">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建表单对话框。Q35（527:24216）：440 宽、名称 390×32、底栏 80×32；不点创建不产生任何记录 -->
    <el-dialog
      v-model="formDialogVisible"
      :title="t('form.appCenter.newForm')"
      width="440px"
      class="ws-form-dialog"
    >
      <div class="ws-dialog-field ws-dialog-field--dialog440">
        <label class="ws-dialog-field__label">{{ t('form.appCenter.formNameLabel') }}</label>
        <el-input
          v-model="newForm.name"
          data-testid="form-name-input"
          maxlength="200"
          :placeholder="t('form.appCenter.formNamePlaceholder')"
        />
      </div>
      <template #footer>
        <el-button @click="formDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateForm">
          {{ t('form.appCenter.createFormConfirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 表单改名对话框 -->
    <el-dialog v-model="renameDialogVisible" :title="t('common.edit')" width="420px">
      <el-form label-width="80px">
        <el-form-item :label="t('form.appCenter.fieldName')" required>
          <el-input v-model="renameTarget.name" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renameDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="renameSaving" @click="handleRenameForm">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-ws {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.app-ws__error {
  color: #f56c6c;
  padding: 16px 24px;
}
.app-ws__body {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
</style>

<style>
/* Q34/Q35（272:1698 / 527:24216）：新建目录 540（字段 490×32）/ 新建表单 440（字段 390×32），
   底栏统一 80×32；teleport 弹层样式落真实弹窗根（全局块）。 */
.ws-dir-dialog .el-dialog__footer .el-button,
.ws-form-dialog .el-dialog__footer .el-button {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
}
.ws-dir-dialog .ws-dialog-field {
  width: 490px;
  max-width: 100%;
  margin: 0 auto;
}
.ws-dir-dialog .ws-dialog-field + .ws-dialog-field {
  margin-top: 16px;
}
.ws-form-dialog .ws-dialog-field--dialog440 {
  width: 390px;
  max-width: 100%;
  margin: 0 auto;
}
.ws-dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ws-dialog-field__label {
  color: var(--sw-text-regular, #606266);
  font-size: 14px;
  line-height: 22px;
}
.ws-dialog-field__label--required::before {
  content: '* ';
  color: var(--sw-danger, #c2303a);
}
.ws-dialog-field .el-input__wrapper,
.ws-dialog-field .el-select__wrapper {
  box-sizing: border-box;
  min-height: 32px;
  height: 32px;
}

/* 527:24284（执行提示18）：外盒 440×172@(740,454)；标题/正文/按钮恢复原锚点，删除 #C2303A */
.sw-delete-confirm {
  box-sizing: border-box;
  width: 440px !important;
  height: 172px;
  padding: 28px 25px 27px 24px;
  border-radius: 12px;
  /* EP 以内联 --el-messagebox-width 定宽，需覆盖变量 */
  --el-messagebox-width: 440px;
  --el-messagebox-padding-primary: 0px;
}
.sw-delete-confirm .el-message-box__header {
  padding-bottom: 22px;
}
.sw-delete-confirm .el-message-box__headerbtn {
  top: 26px;
  right: 25px;
  width: 32px;
  height: 32px;
}
.sw-delete-confirm .el-message-box__title {
  color: #172033;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.sw-delete-confirm .el-message-box__content {
  padding: 0;
}
.sw-delete-confirm .el-message-box__message p {
  color: #606266;
  font-size: 14px;
  line-height: 22px;
}
.sw-delete-confirm .el-message-box__btns {
  gap: 8px;
  padding-top: 17px;
}
.sw-delete-confirm .el-message-box__btns .el-button {
  min-width: 80px;
  width: 80px;
  height: 32px;
  margin: 0;
}
.sw-delete-confirm .el-message-box__btns .el-button--primary {
  background-color: #c2303a;
  border-color: #c2303a;
}
.sw-delete-confirm .el-message-box__btns .el-button--primary:not(:hover):not(:focus) {
  background-color: #c2303a;
  border-color: #c2303a;
}
</style>
