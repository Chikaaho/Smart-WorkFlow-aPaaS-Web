<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { LoadErrorState } from '@/components/page-layout'
import AppScopePicker, { type AppScopeValue } from '@/components/AppScopePicker.vue'
import AppGrid from '@/modules/form/components/AppGrid.vue'
import AppGridToolbar from '@/modules/form/components/AppGridToolbar.vue'
import AppPerRowSetting from '@/modules/form/components/AppPerRowSetting.vue'
import { useAppPerRow } from '@/modules/form/components/useAppPerRow'
import AppAppearancePicker from '@/modules/form/components/AppAppearancePicker.vue'
import DetailDialog from '@/components/DetailDialog.vue'
import {
  createFormApp,
  deleteFormApp,
  listFormApps,
  updateFormApp,
} from '@/modules/form/api/app-center'
import type { FormApp, FormAppSaveReq } from '@/contracts/app-center'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import { ApiError } from '@/foundation/request'

/**
 * 应用管理：共享网格卡片，筛选栏提供新建入口，卡片右上角菜单提供编辑/删除。
 */
const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()

const apps = ref<FormApp[]>([])
const keyword = ref('')
const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)
const { perRow, options: perRowOptions } = useAppPerRow()

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  loadError.value = null
  try {
    apps.value = await listFormApps(keyword.value.trim() || undefined)
  } catch (err: unknown) {
    loadError.value = err instanceof ApiError ? err : null
    errorMsg.value = loadError.value ? '' : t('form.appCenter.loadFailed', { msg: String(err) })
    apps.value = []
  } finally {
    loading.value = false
  }
}

// ==================== 新建 / 修改对话框 ====================

const dialogVisible = ref(false)
const appearancePickerActive = ref(false)
const scopeExpanded = ref(false)
/** null=新建 */
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = reactive<FormAppSaveReq>({
  name: '',
  icon: null,
  color: null,
  sortNo: 0,
  visibleScopeType: 'SPECIFIED',
  userIds: [],
  deptIds: [],
  roleCodes: [],
  postIds: [],
  tenantIds: [],
})

const dialogTitle = computed(() =>
  editingId.value ? t('form.appCenter.editApp') : t('form.appCenter.newApp'),
)

function openCreate() {
  editingId.value = null
  appearancePickerActive.value = false
  scopeExpanded.value = false
  Object.assign(form, {
    name: '',
    icon: 'Grid',
    color: '#6f2dff',
    sortNo: 0,
    // 新建默认「指定范围」并预选创建者（保存时明确展示，不把空值误作全员）
    visibleScopeType: 'SPECIFIED',
    userIds: userStore.user?.id ? [Number(userStore.user.id)] : [],
    deptIds: [],
    roleCodes: [],
    postIds: [],
    tenantIds: [],
  })
  dialogVisible.value = true
}

function openEdit(app: FormApp) {
  editingId.value = app.id
  appearancePickerActive.value = false
  scopeExpanded.value = false
  Object.assign(form, {
    name: app.name,
    icon: app.icon ?? 'Folder',
    color: app.color ?? '#6f2dff',
    sortNo: app.sortNo ?? 0,
    visibleScopeType: app.visibleScopeType,
    userIds: app.visibleUserIds ? [...app.visibleUserIds] : [],
    deptIds: app.visibleDeptIds ? [...app.visibleDeptIds] : [],
    roleCodes: app.visibleRoleCodes ? [...app.visibleRoleCodes] : [],
    postIds: app.visiblePostIds ? [...app.visiblePostIds] : [],
    tenantIds: app.visibleTenantIds ? [...app.visibleTenantIds] : [],
  })
  dialogVisible.value = true
}

/** 多维度可见范围选择器双向绑定（0.1.7 #1）。 */
const scopeValue = computed<AppScopeValue>(() => ({
  userIds: form.userIds ?? [],
  deptIds: form.deptIds ?? [],
  roleCodes: form.roleCodes ?? [],
  postIds: form.postIds ?? [],
  tenantIds: form.tenantIds ?? [],
}))

function applyScope(value: AppScopeValue) {
  form.userIds = [...value.userIds]
  form.deptIds = [...value.deptIds]
  form.roleCodes = [...value.roleCodes]
  form.postIds = [...value.postIds]
  form.tenantIds = [...value.tenantIds]
}

async function handleSave() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  const specified = form.visibleScopeType === 'SPECIFIED'
  const payload: FormAppSaveReq = {
    name,
    icon: form.icon,
    color: form.color,
    sortNo: form.sortNo ?? 0,
    visibleScopeType: form.visibleScopeType,
    userIds: specified ? (form.userIds ?? []) : [],
    deptIds: specified ? (form.deptIds ?? []) : [],
    roleCodes: specified ? (form.roleCodes ?? []) : [],
    postIds: specified ? (form.postIds ?? []) : [],
    tenantIds: specified ? (form.tenantIds ?? []) : [],
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateFormApp(editingId.value, payload)
    } else {
      await createFormApp(payload)
    }
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  } finally {
    saving.value = false
  }
}

// ==================== 卡片动作 ====================

function enterWorkspace(app: FormApp) {
  void router.push({ name: 'form-app-manage-workspace', params: { appId: app.id } })
}

function onCardCommand(command: string, app: FormApp) {
  if (command === 'edit') {
    openEdit(app)
    return
  }
  if (command === 'delete') {
    void handleDelete(app)
  }
}

async function handleDelete(app: FormApp) {
  try {
    await ElMessageBox.confirm(
      t('form.appCenter.deleteConfirm', { name: app.name }),
      t('common.deleteConfirmTitle'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteFormApp(app.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <div class="app-manage">
    <AppGridToolbar
      v-model="keyword"
      :label="t('appearance.appName')"
      :placeholder="t('common.pleaseInput')"
      test-id="app-manage-search"
      @search="loadList"
    >
      <template #actions>
        <AppPerRowSetting v-model="perRow" :options="perRowOptions" />
        <el-button
          v-perm="'form:app:manage'"
          type="primary"
          data-testid="app-create"
          style="width: 80px; padding: 0"
          @click="openCreate"
          >{{ t('form.appCenter.newApp') }}</el-button
        >
      </template>
    </AppGridToolbar>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="loadList" />
    <div v-else-if="errorMsg" class="app-manage__error">{{ errorMsg }}</div>

    <AppGrid
      v-else
      :apps="apps"
      :loading="loading"
      :per-row="perRow"
      show-actions
      show-form-count
      @select="enterWorkspace"
      @command="onCardCommand"
      @create="openCreate"
    />

    <DetailDialog
      :model-value="dialogVisible"
      :title="dialogTitle"
      width="600px"
      appearance="design"
      class="app-manage-dialog"
      :class="{ 'app-manage-dialog--covered': appearancePickerActive }"
      :destroy-on-close="false"
      @update:model-value="dialogVisible = $event"
    >
      <el-form label-position="top">
        <el-form-item :label="t('appearance.appName')" required>
          <el-input
            v-model="form.name"
            data-testid="app-name-input"
            maxlength="100"
            :placeholder="t('common.pleaseInput')"
          />
        </el-form-item>
        <AppAppearancePicker
          v-model:icon="form.icon"
          v-model:color="form.color"
          @active="appearancePickerActive = $event"
        />
        <el-form-item v-if="scopeExpanded" :label="t('form.appCenter.fieldScope')">
          <el-radio-group v-model="form.visibleScopeType" data-testid="app-scope">
            <el-radio value="SPECIFIED">{{ t('form.appCenter.scopeSpecified') }}</el-radio>
            <el-radio value="ALL">{{ t('form.appCenter.scopeAllOption') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 0.1.7 #1：可见范围按用户/部门/角色/岗位/租户多维度指定，任一维度命中即可见 -->
        <el-form-item
          v-if="scopeExpanded && form.visibleScopeType === 'SPECIFIED'"
          :label="t('form.appCenter.fieldScope')"
        >
          <AppScopePicker :model-value="scopeValue" @update:model-value="applyScope" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button
          link
          type="primary"
          class="app-manage-dialog__scope"
          :aria-expanded="scopeExpanded"
          @click="scopeExpanded = !scopeExpanded"
          >{{ t('form.appCenter.fieldScope') }}</el-button
        >
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
      </template>
    </DetailDialog>
  </div>
</template>

<style scoped>
.app-manage {
  box-sizing: border-box;
  min-height: 100%;
  padding: var(--sw-space-20);
}
.app-manage__error {
  color: #f56c6c;
}
</style>

<style>
.el-overlay:has(.app-manage-dialog--covered) {
  visibility: hidden;
}
.app-manage-dialog .el-form-item {
  margin-bottom: 12px;
}
.app-manage-dialog .el-form-item__label {
  height: 22px;
  line-height: 22px;
  margin-bottom: 6px;
  padding: 0;
}
.app-manage-dialog .el-dialog__footer .app-manage-dialog__scope {
  margin-right: auto;
}
</style>
