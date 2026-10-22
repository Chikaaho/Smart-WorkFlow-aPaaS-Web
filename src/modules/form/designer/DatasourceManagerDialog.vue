<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { usePermission } from '@/foundation/permission'
import DetailDialog from '@/components/DetailDialog.vue'
import {
  createManagedDatasource,
  deleteManagedDatasource,
  pageManagedDatasources,
  updateManagedDatasource,
  type ManagedDatasource,
  type ManagedDatasourcePayload,
} from '../api/datasource'
import { ApiError } from '@/foundation/request'

const { t } = useI18n()
const { hasPerm } = usePermission()
const canManage = computed(() => hasPerm('workflow:datasource:manage'))
const visible = defineModel<boolean>({ required: true })

const rows = ref<ManagedDatasource[]>([])
const loading = ref(false)
const error = ref('')
const editing = ref<ManagedDatasource | null>(null)
const formVisible = ref(false)
const saving = ref(false)
const formError = ref('')

const drivers: Record<ManagedDatasource['type'], string> = {
  postgresql: 'org.postgresql.Driver',
  mysql: 'com.mysql.cj.jdbc.Driver',
  h2: 'org.h2.Driver',
  oracle: 'oracle.jdbc.OracleDriver',
}

const form = reactive({
  name: '',
  type: 'postgresql' as ManagedDatasource['type'],
  jdbcUrl: '',
  username: '',
  password: '',
  readOnly: 1,
  enabled: 1,
})

const dialogTitle = computed(() =>
  editing.value ? t('datasource.editTitle') : t('datasource.createTitle'),
)

async function load() {
  if (!canManage.value) return
  loading.value = true
  error.value = ''
  try {
    const page = await pageManagedDatasources({ pageNum: 1, pageSize: 100 }, {})
    rows.value = page.list
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('datasource.loadFailed')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    type: 'postgresql',
    jdbcUrl: '',
    username: '',
    password: '',
    readOnly: 1,
    enabled: 1,
  })
  editing.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

function openEdit(raw: unknown) {
  const row = raw as ManagedDatasource
  resetForm()
  editing.value = row
  Object.assign(form, {
    name: row.name,
    type: row.type,
    jdbcUrl: row.jdbcUrl,
    username: row.username,
    readOnly: row.readOnly,
    enabled: row.enabled,
  })
  formVisible.value = true
}

async function save() {
  if (saving.value) return
  if (!form.name.trim() || !form.jdbcUrl.trim() || !form.username.trim()) {
    formError.value = t('datasource.required')
    return
  }
  if (!editing.value && !form.password) {
    formError.value = t('datasource.passwordRequired')
    return
  }
  const payload: ManagedDatasourcePayload = {
    name: form.name.trim(),
    type: form.type,
    jdbcUrl: form.jdbcUrl.trim(),
    driverClass: drivers[form.type],
    username: form.username.trim(),
    ...(form.password ? { password: form.password } : {}),
    readOnly: form.readOnly,
    enabled: form.enabled,
  }
  saving.value = true
  formError.value = ''
  try {
    if (editing.value) await updateManagedDatasource(editing.value.id, payload)
    else await createManagedDatasource(payload)
    ElMessage.success(t('common.saveSuccess'))
    formVisible.value = false
    await load()
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    saving.value = false
  }
}

async function remove(raw: unknown) {
  const row = raw as ManagedDatasource
  try {
    await ElMessageBox.confirm(
      t('datasource.deleteConfirm', { name: row.name }),
      t('common.confirm'),
      {
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await deleteManagedDatasource(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await load()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.deleteFailed'))
  }
}

onMounted(load)
</script>

<template>
  <DetailDialog
    v-model="visible"
    appearance="design"
    :title="t('datasource.title')"
    width="980px"
    :error="error"
    :loading="loading"
    @opened="load"
  >
    <div class="datasource-toolbar">
      <p>{{ t('datasource.hint') }}</p>
      <el-button type="primary" @click="openCreate">{{ t('datasource.create') }}</el-button>
    </div>
    <el-table :data="rows" max-height="430">
      <el-table-column prop="name" :label="t('datasource.name')" min-width="150" />
      <el-table-column prop="type" :label="t('datasource.type')" width="110" />
      <el-table-column
        prop="jdbcUrl"
        :label="t('datasource.url')"
        min-width="270"
        show-overflow-tooltip
      />
      <el-table-column prop="username" :label="t('datasource.username')" width="130" />
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          {{
            Number(row.enabled) === 1 ? t('common.statusNormal') : t('system.tenantStatusDisabled')
          }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="150">
        <template #default="{ row }">
          <el-button link @click="openEdit(row)">{{ t('common.edit') }}</el-button>
          <el-button link type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </DetailDialog>

  <DetailDialog
    v-model="formVisible"
    appearance="design"
    :title="dialogTitle"
    width="720px"
    :error="formError"
    :show-close="!saving"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form label-position="top">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('datasource.name')" required>
            <el-input v-model="form.name" maxlength="100" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('datasource.type')" required>
            <el-select v-model="form.type">
              <el-option v-for="(_, type) in drivers" :key="type" :value="type" :label="type" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item :label="t('datasource.url')" required>
        <el-input v-model="form.jdbcUrl" maxlength="500" />
      </el-form-item>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('datasource.username')" required>
            <el-input v-model="form.username" maxlength="100" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('datasource.password')">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              maxlength="200"
              :placeholder="editing ? t('datasource.passwordKeep') : ''"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <div class="datasource-switches">
        <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        <span>{{ t('system.enableTenant') }}</span>
        <el-switch v-model="form.readOnly" :active-value="1" :inactive-value="0" />
        <span>{{ t('datasource.readOnly') }}</span>
      </div>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="formVisible = false">{{
        t('common.cancel')
      }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </DetailDialog>
</template>

<style scoped>
.datasource-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  margin-bottom: var(--sw-space-12);
}
.datasource-toolbar p {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}
.datasource-switches {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
}
.datasource-switches span:not(:last-child) {
  margin-right: var(--sw-space-20);
}
</style>
