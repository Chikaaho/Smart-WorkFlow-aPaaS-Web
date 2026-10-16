<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Folder, MoreFilled, Plus } from '@element-plus/icons-vue'
import AppIcon from '@/modules/form/components/AppIcon.vue'
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
 * 新建表单只收集名称、不落库——进入设计器新建态，首次保存才创建记录（回归01b：
 * 未保存不新建记录）；树点击表单直达设计器（已发布表单的修改入口），保存/返回回到本页。
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
const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && dirs.value.length === 0 && directForms.value.length === 0,
)

/** 树点击表单 → 直达表单设计器（0.1.7 回归01b：已发布表单的修改入口）。 */
function selectForm(item: FormAppFormItem) {
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

function openRenameDir(dir: { id: string; name: string; sortNo: number }) {
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
      { type: 'warning' },
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
      <aside class="app-ws__side">
        <div class="app-ws__side-head">
          <button
            type="button"
            class="app-ws__back"
            data-testid="app-back"
            :title="t('form.appCenter.backToList')"
            @click="backToList"
          >
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <AppIcon
            v-if="content"
            class="app-ws__app-icon"
            :icon="content.app.icon"
            :color="content.app.color"
            :size="18"
          />
          <span class="app-ws__app-name" data-testid="app-detail-name">
            {{ content?.app.name ?? t('form.appCenter.workspaceTitle') }}
          </span>
          <el-tag v-if="content?.app.status === 'DISABLED'" type="info" size="small">
            {{ t('form.appCenter.statusDisabled') }}
          </el-tag>
        </div>

        <nav v-if="!isEmpty" class="app-ws__tree" :aria-label="t('form.appCenter.appNavTitle')">
          <template v-for="dir in dirs" :key="dir.id">
            <div class="app-ws__dir" data-testid="app-tree-dir">
              <el-icon class="app-ws__dir-icon"><Folder /></el-icon>
              <span class="app-ws__dir-name">{{ dir.name }}</span>
              <el-dropdown
                class="app-ws__more"
                trigger="click"
                @command="(cmd: string) => onDirCommand(cmd, dir)"
              >
                <span class="app-ws__more-trigger" :data-testid="'dir-more-' + dir.id" @click.stop>
                  <el-icon><MoreFilled /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-perm="'form:app:manage'" command="rename">
                      {{ t('common.edit') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-perm="'form:app:manage'" command="form">
                      {{ t('form.appCenter.newFormInDir') }}
                    </el-dropdown-item>
                    <el-dropdown-item v-perm="'form:app:manage'" command="delete" divided>
                      {{ t('common.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <button
              v-for="item in dir.forms ?? []"
              :key="item.formId"
              type="button"
              class="app-ws__form"
              data-testid="app-tree-form"
              :data-form-key="item.formKey"
              @click="selectForm(item)"
            >
              <span class="app-ws__form-name">{{ item.name }}</span>
              <el-dropdown
                class="app-ws__more"
                trigger="click"
                @command="(cmd: string) => onFormCommand(cmd, item)"
              >
                <span class="app-ws__more-trigger" @click.stop>
                  <el-icon><MoreFilled /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="rename">{{ t('common.edit') }}</el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      {{ t('common.delete') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </button>
          </template>

          <button
            v-for="item in directForms"
            :key="item.formId"
            type="button"
            class="app-ws__form app-ws__form--root"
            data-testid="app-tree-form"
            :data-form-key="item.formKey"
            @click="selectForm(item)"
          >
            <span class="app-ws__form-name">{{ item.name }}</span>
            <el-dropdown
              class="app-ws__more"
              trigger="click"
              @command="(cmd: string) => onFormCommand(cmd, item)"
            >
              <span class="app-ws__more-trigger" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">{{ t('common.edit') }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>{{
                    t('common.delete')
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </button>
        </nav>

        <div class="app-ws__side-foot">
          <el-dropdown v-perm="'form:app:manage'" trigger="click" @command="onCreateCommand">
            <el-button class="app-ws__create" data-testid="app-ws-create" :icon="Plus">
              {{ t('form.appCenter.createAction') }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="dir" data-testid="dir-create">
                  {{ t('form.appCenter.newDir') }}
                </el-dropdown-item>
                <el-dropdown-item command="form" data-testid="form-create">
                  {{ t('form.appCenter.newForm') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </aside>

      <!-- 右侧内容：空应用只展示「暂无数据」；非空提示从左侧进入设计 -->
      <section class="app-ws__panel">
        <p v-if="isEmpty" class="app-ws__empty" data-testid="app-ws-empty">
          {{ t('form.appCenter.emptyAppContent') }}
        </p>
        <p v-else class="app-ws__empty">{{ t('form.appCenter.pickForm') }}</p>
      </section>
    </div>

    <!-- 目录新建/改名对话框（0.1.7 #4：修改只改名称） -->
    <el-dialog v-model="dirDialogVisible" :title="dirDialogTitle" width="420px">
      <el-form label-width="80px">
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

    <!-- 新建表单对话框 -->
    <el-dialog v-model="formDialogVisible" :title="t('form.appCenter.newForm')" width="420px">
      <el-form label-width="80px">
        <el-form-item :label="t('form.appCenter.fieldName')" required>
          <el-input v-model="newForm.name" data-testid="form-name-input" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleCreateForm">
          {{ t('common.save') }}
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
/* 应用专属侧边栏（0.1.7 #4）：与用户端应用内页同构的白底树 + 底部新建 */
.app-ws__side {
  flex: 0 0 240px;
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.app-ws__side-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid #f0f2f5;
}
.app-ws__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
  color: #606266;
  cursor: pointer;
  flex: 0 0 auto;
}
.app-ws__back:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}
.app-ws__app-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-ws__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.app-ws__dir {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.app-ws__dir:first-child {
  margin-top: 0;
}
.app-ws__dir-icon {
  color: #909399;
}
.app-ws__dir-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-ws__form {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 26px 7px 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
}
.app-ws__form--root {
  padding-left: 12px;
  margin-top: 2px;
}
.app-ws__form:hover {
  background: #f5f7fa;
  color: #303133;
}
.app-ws__form.is-active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 500;
}
.app-ws__form-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-ws__more {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  visibility: hidden;
}
.app-ws__dir .app-ws__more {
  position: static;
  transform: none;
  margin-left: auto;
  visibility: hidden;
}
.app-ws__dir:hover .app-ws__more,
.app-ws__form:hover .app-ws__more,
.app-ws__more-trigger:focus-visible {
  visibility: visible;
}
.app-ws__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: #909399;
  cursor: pointer;
}
.app-ws__more-trigger:hover {
  background: #ebeef5;
  color: #303133;
}
.app-ws__side-foot {
  padding: 10px 12px 14px;
  border-top: 1px solid #f0f2f5;
}
.app-ws__create {
  width: 100%;
}
.app-ws__panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.app-ws__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: #909399;
}
</style>
