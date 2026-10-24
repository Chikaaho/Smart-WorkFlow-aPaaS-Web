<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { usePermission } from '@/foundation/permission'
import DetailDialog from '@/components/DetailDialog.vue'
import {
  createManagedDatasource,
  deleteManagedDatasource,
  listDatasourceGrants,
  listExtQueryContracts,
  pageManagedDatasources,
  replaceDatasourceGrants,
  setExtQueryContractEnabled,
  updateManagedDatasource,
  type DatasourceGrant,
  type DatasourceGrantSubjectType,
  type ExtQueryContract,
  type ManagedDatasource,
  type ManagedDatasourcePayload,
} from '../api/datasource'
import { ApiError } from '@/foundation/request'

const { t } = useI18n()
const { hasPerm } = usePermission()
const canManage = computed(() => hasPerm('workflow:datasource:manage'))
const canToggleContract = computed(() => hasPerm('form:design:save'))
const visible = defineModel<boolean>({ required: true })

const activeTab = ref<'datasources' | 'contracts'>('datasources')
const rows = ref<ManagedDatasource[]>([])
const loading = ref(false)
const error = ref('')
const editing = ref<ManagedDatasource | null>(null)
const formVisible = ref(false)
const saving = ref(false)
const formError = ref('')

const contracts = ref<ExtQueryContract[]>([])
const contractsLoading = ref(false)
const contractsError = ref('')
const togglingContract = ref('')

const grantVisible = ref(false)
const grantTarget = ref<ManagedDatasource | null>(null)
const grants = ref<DatasourceGrant[]>([])
const grantsLoading = ref(false)
const grantsSaving = ref(false)
const grantsError = ref('')
const newGrantType = ref<DatasourceGrantSubjectType>('ROLE')
const newGrantKey = ref('')

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

const grantDialogTitle = computed(() =>
  grantTarget.value ? `授权主体 · ${grantTarget.value.name}` : '授权主体',
)

function grantTypeLabel(type: DatasourceGrantSubjectType): string {
  return type === 'ROLE' ? '角色' : '用户'
}

function grantPlaceholder(): string {
  return newGrantType.value === 'ROLE' ? '角色编码，如 designer' : '用户 ID，如 2113516345554395137'
}

function contractEnabled(raw: unknown): boolean {
  const contract = raw as ExtQueryContract
  return contract.enabled === true || Number(contract.enabled) === 1
}

function datasourceName(id: unknown): string {
  const idText = String(id)
  return rows.value.find((row) => String(row.id) === idText)?.name ?? idText
}

function outputFieldNames(raw: unknown): string {
  const contract = raw as ExtQueryContract
  return (contract.outputFields ?? []).map((field) => field.name).join('、') || '—'
}

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

async function loadContracts() {
  if (!canManage.value) return
  contractsLoading.value = true
  contractsError.value = ''
  try {
    contracts.value = await listExtQueryContracts()
  } catch (err) {
    contractsError.value = err instanceof ApiError ? err.msg : '读取查询契约失败'
    contracts.value = []
  } finally {
    contractsLoading.value = false
  }
}

function onTabChange(name: string | number) {
  if (name === 'contracts') void loadContracts()
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
    // 编辑时留空不发送 password，服务端保留原密文；填写新值即重加密。
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

async function openGrants(raw: unknown) {
  const row = raw as ManagedDatasource
  grantTarget.value = row
  grants.value = []
  newGrantType.value = 'ROLE'
  newGrantKey.value = ''
  grantsError.value = ''
  grantVisible.value = true
  await loadGrants()
}

async function loadGrants() {
  if (!grantTarget.value) return
  grantsLoading.value = true
  grantsError.value = ''
  try {
    grants.value = await listDatasourceGrants(grantTarget.value.id)
  } catch (err) {
    grantsError.value = err instanceof ApiError ? err.msg : '读取授权主体失败'
    grants.value = []
  } finally {
    grantsLoading.value = false
  }
}

function addGrant() {
  const key = newGrantKey.value.trim()
  if (!key) {
    grantsError.value = newGrantType.value === 'ROLE' ? '请填写角色编码' : '请填写用户 ID'
    return
  }
  if (newGrantType.value === 'ROLE' && !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) {
    grantsError.value = '角色编码只能包含字母、数字、下划线或中划线，最长 64 位'
    return
  }
  if (newGrantType.value === 'USER' && !/^\d+$/.test(key)) {
    grantsError.value = '用户 ID 只能包含数字'
    return
  }
  if (
    grants.value.some(
      (grant) => grant.subjectType === newGrantType.value && grant.subjectKey === key,
    )
  ) {
    grantsError.value = '该授权主体已添加'
    return
  }
  if (grants.value.length >= 200) {
    grantsError.value = '单个数据源最多授权 200 个主体'
    return
  }
  grants.value.push({ subjectType: newGrantType.value, subjectKey: key })
  newGrantKey.value = ''
  grantsError.value = ''
}

function removeGrant(index: number) {
  grants.value = grants.value.filter((_, current) => current !== index)
}

async function saveGrants() {
  if (!grantTarget.value || grantsSaving.value) return
  grantsSaving.value = true
  grantsError.value = ''
  try {
    await replaceDatasourceGrants(grantTarget.value.id, [...grants.value])
    ElMessage.success(t('common.saveSuccess'))
    // 整集合替换后回读服务端结果，页面以服务端状态为准。
    await loadGrants()
  } catch (err) {
    grantsError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    grantsSaving.value = false
  }
}

function onGrantClosed() {
  grantTarget.value = null
  grants.value = []
  newGrantKey.value = ''
  grantsError.value = ''
}

async function toggleContract(raw: unknown, value: string | number | boolean) {
  const contract = raw as ExtQueryContract
  if (!canToggleContract.value || togglingContract.value) return
  const enabled = value === true || Number(value) === 1
  togglingContract.value = contract.queryKey
  try {
    await setExtQueryContractEnabled(contract.queryKey, enabled)
    ElMessage.success(t('common.updateSuccess'))
    await loadContracts()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '查询契约启停失败')
  } finally {
    togglingContract.value = ''
  }
}

onMounted(load)
watch(visible, (open) => {
  if (!open) return
  void load()
  if (activeTab.value === 'contracts') void loadContracts()
})
</script>

<template>
  <DetailDialog
    v-model="visible"
    appearance="design"
    :title="t('datasource.title')"
    width="1080px"
    :error="error"
    :loading="loading"
  >
    <div class="datasource-dialog">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane :label="t('datasource.title')" name="datasources">
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
              min-width="250"
              show-overflow-tooltip
            />
            <el-table-column prop="username" :label="t('datasource.username')" width="120" />
            <el-table-column :label="t('common.status')" width="90">
              <template #default="{ row }">
                {{
                  Number(row.enabled) === 1
                    ? t('common.statusNormal')
                    : t('system.tenantStatusDisabled')
                }}
              </template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="210">
              <template #default="{ row }">
                <el-button link @click="openEdit(row)">{{ t('common.edit') }}</el-button>
                <el-button link @click="openGrants(row)">授权</el-button>
                <el-button link type="danger" @click="remove(row)">{{
                  t('common.delete')
                }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="查询契约" name="contracts">
          <div class="datasource-toolbar">
            <p>仅展示当前账号可引用的查询契约；停用后设计与运行读取会被拒绝。</p>
            <el-button :loading="contractsLoading" @click="loadContracts">刷新</el-button>
          </div>
          <el-alert
            v-if="contractsError"
            :title="contractsError"
            type="error"
            :closable="false"
            show-icon
          />
          <p v-if="!canToggleContract" class="datasource-note">
            当前账号可查看查询契约；启停需要表单设计保存权限。
          </p>
          <el-table
            v-loading="contractsLoading"
            :data="contracts"
            max-height="430"
            empty-text="暂无已授权查询契约"
          >
            <el-table-column
              prop="queryKey"
              :label="t('form.queryContractKeyLabel')"
              min-width="180"
            />
            <el-table-column :label="t('common.version')" width="90">
              <template #default="{ row }">v{{ row.queryVersion }}</template>
            </el-table-column>
            <el-table-column :label="t('form.fieldTypeDatasource')" min-width="150">
              <template #default="{ row }">{{ datasourceName(row.datasourceId) }}</template>
            </el-table-column>
            <el-table-column label="输出字段" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ outputFieldNames(row) }}</template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="100">
              <template #default="{ row }">
                <el-switch
                  :model-value="contractEnabled(row)"
                  :disabled="!canToggleContract || togglingContract === row.queryKey"
                  @change="(value) => toggleContract(row, value)"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
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

  <DetailDialog
    v-model="grantVisible"
    appearance="design"
    :title="grantDialogTitle"
    width="760px"
    :error="grantsError"
    :loading="grantsLoading"
    :show-close="!grantsSaving"
    @closed="onGrantClosed"
  >
    <p class="datasource-note">
      授权后，所选角色或用户可引用该数据源下已登记的查询契约。保存时会以当前列表覆盖原有授权；清空列表即撤销全部授权。
    </p>
    <el-table :data="grants" max-height="300" empty-text="暂无授权主体">
      <el-table-column label="主体类型" width="110">
        <template #default="{ row }">{{ grantTypeLabel(row.subjectType) }}</template>
      </el-table-column>
      <el-table-column prop="subjectKey" label="角色编码 / 用户 ID" min-width="240" />
      <el-table-column :label="t('common.actions')" width="80">
        <template #default="{ $index }">
          <el-button link type="danger" @click="removeGrant($index)">{{
            t('common.remove')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="grant-add">
      <el-select v-model="newGrantType" class="grant-add__type">
        <el-option value="ROLE" label="角色" />
        <el-option value="USER" label="用户" />
      </el-select>
      <el-input
        v-model="newGrantKey"
        class="grant-add__key"
        :placeholder="grantPlaceholder()"
        @keyup.enter="addGrant"
      />
      <el-button @click="addGrant">{{ t('common.add') }}</el-button>
    </div>
    <template #footer>
      <el-button :disabled="grantsSaving" @click="grantVisible = false">{{
        t('common.cancel')
      }}</el-button>
      <el-button type="primary" :loading="grantsSaving" @click="saveGrants">{{
        t('common.save')
      }}</el-button>
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
.datasource-note {
  margin: 0 0 var(--sw-space-12);
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: 1.6;
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
.grant-add {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
  margin-top: var(--sw-space-12);
}
.grant-add__type {
  width: 100px;
  flex: none;
}
.grant-add__key {
  flex: 1;
}
</style>
