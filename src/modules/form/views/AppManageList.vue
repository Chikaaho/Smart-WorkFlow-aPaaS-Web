<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, LoadErrorState } from '@/components/page-layout'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import { APP_COLOR_PRESETS, APP_ICON_KEYS } from '@/modules/form/utils/app-icons'
import {
  createFormApp,
  deleteFormApp,
  disableFormApp,
  enableFormApp,
  listFormApps,
  updateFormApp,
} from '@/modules/form/api/app-center'
import type { FormApp, FormAppSaveReq } from '@/contracts/app-center'
import { useUserStore } from '@/stores/user'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import { ApiError } from '@/foundation/request'

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()

const apps = ref<FormApp[]>([])
const keyword = ref('')
const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)

const isEmpty = computed(
  () => !loading.value && !errorMsg.value && !loadError.value && apps.value.length === 0,
)

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

function handleQuery() {
  void loadList()
}

function handleReset() {
  keyword.value = ''
  void loadList()
}

// ==================== 编辑对话框 ====================

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
    // 新建默认「指定用户」并预选创建者（保存时明确展示，不把空值误作全员）
    visibleScopeType: 'SPECIFIED',
    userIds: userStore.user?.id ? [Number(userStore.user.id)] : [],
  })
  dialogVisible.value = true
}

function openEdit(row: unknown) {
  const app = row as FormApp
  editingId.value = app.id
  Object.assign(form, {
    name: app.name,
    icon: app.icon ?? 'Folder',
    color: app.color ?? '#7e306b',
    sortNo: app.sortNo ?? 0,
    visibleScopeType: app.visibleScopeType,
    userIds: app.visibleUserIds ? [...app.visibleUserIds] : [],
  })
  dialogVisible.value = true
}

async function handleSave() {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning(t('form.appCenter.nameRequired'))
    return
  }
  const payload: FormAppSaveReq = {
    name,
    icon: form.icon,
    color: form.color,
    sortNo: form.sortNo ?? 0,
    visibleScopeType: form.visibleScopeType,
    userIds: form.visibleScopeType === 'SPECIFIED' ? (form.userIds ?? []) : [],
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

// ==================== 行操作 ====================

function enterWorkspace(row: unknown) {
  const app = row as FormApp
  void router.push({ name: 'form-app-manage-workspace', params: { appId: app.id } })
}

async function handleToggleStatus(row: unknown) {
  const app = row as FormApp
  const disabling = app.status === 'ENABLED'
  try {
    await ElMessageBox.confirm(
      disabling ? t('form.appCenter.disableConfirm') : t('form.appCenter.enableConfirm'),
      t('common.confirm'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    if (disabling) {
      await disableFormApp(app.id)
    } else {
      await enableFormApp(app.id)
    }
    ElMessage.success(t('common.saveSuccess'))
    await loadList()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

async function handleDelete(row: unknown) {
  const app = row as FormApp
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

// ==================== 展示辅助 ====================

function scopeLabel(row: unknown): string {
  const app = row as FormApp
  if (app.visibleScopeType === 'ALL') return t('form.appCenter.scopeAll')
  const count = app.visibleUserIds?.length ?? 0
  return count === 0 ? t('form.appCenter.scopeNobody') : t('form.appCenter.scopeUsers', { count })
}

function sourceLabel(row: unknown): string {
  const app = row as FormApp
  switch (app.source) {
    case 'LEGACY_CATEGORY':
      return t('form.appCenter.sourceLegacyCategory')
    case 'LEGACY_UNCATEGORIZED':
      return t('form.appCenter.sourceLegacyUncategorized')
    default:
      return t('form.appCenter.sourceManual')
  }
}

const colorInvalid = computed(() => !/^#[0-9a-fA-F]{6}$/.test(form.color ?? ''))

onMounted(() => {
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    :title="t('form.appCenter.manageTitle')"
    :show-toolbar-total="true"
    :total="apps.length"
    :page-num="1"
    :page-size="apps.length || 10"
    :empty="isEmpty"
  >
    <template #toolbar-actions>
      <el-button
        v-perm="'form:app:manage'"
        type="primary"
        data-testid="app-create"
        @click="openCreate"
      >
        {{ t('form.appCenter.newApp') }}
      </el-button>
    </template>

    <template #filter>
      <el-input
        v-model="keyword"
        :placeholder="t('form.appCenter.searchPlaceholder')"
        clearable
        style="width: 220px"
        @keyup.enter="handleQuery"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <LoadErrorState v-if="loadError" :error="loadError" @retry="loadList" />

    <el-table v-loading="loading" :data="apps" stripe style="width: 100%" row-key="id">
      <el-table-column :label="t('form.appCenter.colName')" min-width="220">
        <template #default="{ row }">
          <div class="app-name-cell">
            <AppIcon :icon="row.icon" :color="row.color" :size="16" />
            <div class="app-name-cell__text">
              <span class="app-name-cell__title" data-testid="app-name">{{ row.name }}</span>
              <el-tag v-if="row.status === 'DISABLED'" size="small" type="info">
                {{ t('form.appCenter.statusDisabled') }}
              </el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('form.appCenter.colScope')" min-width="140">
        <template #default="{ row }">{{ scopeLabel(row) }}</template>
      </el-table-column>
      <el-table-column prop="formCount" :label="t('form.appCenter.colFormCount')" width="100" />
      <el-table-column prop="dirCount" :label="t('form.appCenter.colDirCount')" width="100" />
      <el-table-column :label="t('form.appCenter.colSource')" width="120">
        <template #default="{ row }">{{ sourceLabel(row) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="enterWorkspace(row)">
            {{ t('form.appCenter.enterManage') }}
          </el-button>
          <el-button v-perm="'form:app:manage'" link type="primary" @click="openEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button
            v-perm="'form:app:manage'"
            link
            :type="row.status === 'ENABLED' ? 'warning' : 'success'"
            @click="handleToggleStatus(row)"
          >
            {{
              row.status === 'ENABLED' ? t('form.appCenter.disable') : t('form.appCenter.enable')
            }}
          </el-button>
          <el-button v-perm="'form:app:manage'" link type="danger" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #empty-action>
      <el-button v-perm="'form:app:manage'" type="primary" @click="openCreate">
        {{ t('form.appCenter.newApp') }}
      </el-button>
    </template>
  </StandardListTemplate>

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
          <el-input
            v-model="form.color"
            size="small"
            style="width: 120px"
            :class="{ 'is-error': colorInvalid }"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('form.appCenter.fieldSort')">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" />
      </el-form-item>
      <el-form-item :label="t('form.appCenter.fieldScope')">
        <el-radio-group v-model="form.visibleScopeType" data-testid="app-scope">
          <el-radio value="SPECIFIED">{{ t('form.appCenter.scopeSpecified') }}</el-radio>
          <el-radio value="ALL">{{ t('form.appCenter.scopeAllOption') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item
        v-if="form.visibleScopeType === 'SPECIFIED'"
        :label="t('form.appCenter.fieldUsers')"
      >
        <div class="scope-users">
          <UserRemoteSelect v-model="form.userIds" multiple />
          <div v-if="(form.userIds ?? []).length === 0" class="scope-users__hint">
            {{ t('form.appCenter.scopeEmptyHint') }}
          </div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" :disabled="colorInvalid" @click="handleSave">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.app-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-name-cell__text {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.app-name-cell__title {
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
