<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled, Search } from '@element-plus/icons-vue'
import { LoadErrorState } from '@/components/page-layout'
import AppScopePicker, { type AppScopeValue } from '@/components/AppScopePicker.vue'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import { APP_COLOR_PRESETS, APP_ICON_KEYS } from '@/modules/form/utils/app-icons'
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
 * 应用管理（0.1.7 #3）：网格式画布——卡片上图标下名称，右上角三点弹「修改 / 删除」，
 * 最后一张固定为「新建应用」，点击直接新建；去掉分页与顶部新建按钮。
 * 颜色仅提供预设色板（0.1.7 #2：禁止自由输入 RGB/HEX）。
 */
const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()

const apps = ref<FormApp[]>([])
const keyword = ref('')
const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)

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

function handleSearch() {
  void loadList()
}

// ==================== 新建 / 修改对话框 ====================

const dialogVisible = ref(false)
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
  Object.assign(form, {
    name: '',
    icon: 'Folder',
    color: '#7e306b',
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
  Object.assign(form, {
    name: app.name,
    icon: app.icon ?? 'Folder',
    color: app.color ?? '#7e306b',
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
    <div class="app-manage__bar">
      <h2 class="app-manage__title">{{ t('form.appCenter.manageTitle') }}</h2>
      <el-input
        v-model="keyword"
        class="app-manage__search"
        :placeholder="t('form.appCenter.searchPlaceholder')"
        :prefix-icon="Search"
        clearable
        @keyup.enter="handleSearch"
      />
    </div>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="loadList" />
    <div v-else-if="errorMsg" class="app-manage__error">{{ errorMsg }}</div>

    <div v-else v-loading="loading" class="app-manage__grid">
      <button
        v-for="app in apps"
        :key="app.id"
        type="button"
        class="app-card"
        data-testid="app-card"
        @click="enterWorkspace(app)"
      >
        <el-dropdown
          class="app-card__more"
          trigger="click"
          @command="(cmd: string) => onCardCommand(cmd, app)"
        >
          <span class="app-card__more-trigger" data-testid="app-card-more" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-perm="'form:app:manage'" command="edit">
                {{ t('common.edit') }}
              </el-dropdown-item>
              <el-dropdown-item v-perm="'form:app:manage'" command="delete" divided>
                {{ t('common.delete') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <AppIcon :icon="app.icon" :color="app.color" :size="28" />
        <span class="app-card__name" data-testid="app-name">{{ app.name }}</span>
        <el-tag v-if="app.status === 'DISABLED'" class="app-card__tag" size="small" type="info">
          {{ t('form.appCenter.statusDisabled') }}
        </el-tag>
      </button>

      <button
        v-perm="'form:app:manage'"
        type="button"
        class="app-card app-card--create"
        data-testid="app-create"
        @click="openCreate"
      >
        <span class="app-card__plus">+</span>
        <span class="app-card__name">{{ t('form.appCenter.newApp') }}</span>
      </button>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
      <el-form label-width="90px">
        <el-form-item :label="t('form.appCenter.fieldName')" required>
          <el-input
            v-model="form.name"
            data-testid="app-name-input"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('form.appCenter.fieldIcon')">
          <div class="icon-picker">
            <button
              v-for="key in APP_ICON_KEYS"
              :key="key"
              type="button"
              class="icon-picker__item"
              :class="{ 'is-active': form.icon === key }"
              @click="form.icon = key"
            >
              <AppIcon :icon="key" :color="form.color" :size="14" />
            </button>
          </div>
        </el-form-item>
        <!-- 0.1.7 #2：颜色固定预设几种，禁止自由输入 -->
        <el-form-item :label="t('form.appCenter.fieldColor')">
          <div class="color-picker">
            <button
              v-for="c in APP_COLOR_PRESETS"
              :key="c"
              type="button"
              class="color-picker__item"
              :class="{ 'is-active': form.color === c }"
              :style="{ background: c }"
              @click="form.color = c"
            />
          </div>
        </el-form-item>
        <el-form-item :label="t('form.appCenter.fieldScope')">
          <el-radio-group v-model="form.visibleScopeType" data-testid="app-scope">
            <el-radio value="SPECIFIED">{{ t('form.appCenter.scopeSpecified') }}</el-radio>
            <el-radio value="ALL">{{ t('form.appCenter.scopeAllOption') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <!-- 0.1.7 #1：可见范围按用户/部门/角色/岗位/租户多维度指定，任一维度命中即可见 -->
        <el-form-item
          v-if="form.visibleScopeType === 'SPECIFIED'"
          :label="t('form.appCenter.fieldScope')"
        >
          <AppScopePicker :model-value="scopeValue" @update:model-value="applyScope" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-manage {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 24px;
}
.app-manage__bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.app-manage__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
.app-manage__search {
  flex: 0 1 260px;
  margin-left: auto;
}
.app-manage__error {
  color: #f56c6c;
}
.app-manage__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.app-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 120px;
  padding: 20px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.app-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.app-card--create {
  border-style: dashed;
  color: #909399;
  background: #fafafa;
}
.app-card__plus {
  font-size: 28px;
  line-height: 1;
  color: #a8abb2;
}
.app-card__name {
  max-width: 100%;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-card__tag {
  position: absolute;
  left: 8px;
  top: 8px;
}
.app-card__more {
  position: absolute;
  right: 6px;
  top: 6px;
}
.app-card__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #909399;
  cursor: pointer;
}
.app-card__more-trigger:hover {
  background: #f5f7fa;
  color: #303133;
}
.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.icon-picker__item {
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  cursor: pointer;
}
.icon-picker__item.is-active {
  border-color: #7e306b;
}
.color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.color-picker__item {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.color-picker__item.is-active {
  border-color: #303133;
}
.scope-users__hint {
  margin-top: 6px;
  font-size: 12px;
  color: #e6a23c;
}
</style>
