<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/foundation/request'

/**
 * 后台 SSO 配置管理页（sso-admin-config §二）：租户级三 Provider 配置的
 * 列表/编辑（身份模式＋允许企业标识）/启停/应用凭据更新（secret 只写，留空
 * 保留旧值）/配置检查/审计查询。回调地址由服务端推导只读展示；企业微信
 * Owner 延期只读。secret 原文/密文不出现在任何响应、DOM、日志。
 */
interface SsoConfigRow {
  provider: 'WECOM' | 'FEISHU' | 'DINGTALK'
  enabled: boolean
  appId: string
  secretConfigured: boolean
  identityMode: 'personal' | 'enterprise'
  configuredEnterpriseId: string
  callbackUrl: string
  updateTime: string
  deferred: boolean
}

interface CheckResult {
  configExists: boolean
  appIdValid: boolean
  secretUsable: boolean
  enterpriseIdFormat: boolean
  enabled: boolean
  overall: boolean
  summary: string
}

interface AuditRecord {
  id: string
  provider: string
  eventType: string
  result: string
  detail: string
  createTime: string
}

const rows = ref<SsoConfigRow[]>([])
const loading = ref(false)

const editDialog = reactive({
  visible: false,
  provider: '',
  appId: '',
  mode: 'personal',
  enterpriseId: '',
  saving: false,
})
const secretDialog = reactive({ visible: false, provider: '', appSecret: '', saving: false })
const checkDialog = reactive({ visible: false, provider: '', result: null as CheckResult | null })
const auditDrawer = reactive({ visible: false, records: [] as AuditRecord[], loading: false })

function labelOf(provider: string): string {
  return t(`view.ssoConfig.providers.${provider.toLowerCase()}`)
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const data = await request<{ configs: SsoConfigRow[] }>({
      method: 'GET',
      url: '/system/sso/config',
    })
    rows.value = data.configs
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.loadFailed'))
  } finally {
    loading.value = false
  }
}

function openEdit(row: SsoConfigRow): void {
  editDialog.provider = row.provider
  editDialog.appId = row.appId
  editDialog.mode = row.identityMode
  editDialog.enterpriseId = row.configuredEnterpriseId
  editDialog.visible = true
}

async function saveEdit(): Promise<void> {
  if (editDialog.mode === 'enterprise' && !editDialog.enterpriseId.trim()) {
    ElMessage.warning(t('view.ssoConfig.enterpriseIdRequired'))
    return
  }
  editDialog.saving = true
  try {
    const extraConfig =
      editDialog.mode === 'enterprise'
        ? JSON.stringify({ enterpriseId: editDialog.enterpriseId.trim() })
        : '{}'
    await request({
      method: 'PUT',
      url: `/system/sso/config/${editDialog.provider}/basic`,
      data: { appId: editDialog.appId.trim(), extraConfig },
    })
    ElMessage.success(t('view.ssoConfig.saved'))
    editDialog.visible = false
    await reload()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.saveFailed'))
  } finally {
    editDialog.saving = false
  }
}

async function onToggleEnabled(row: SsoConfigRow, enabled: boolean): Promise<void> {
  try {
    await request({
      method: 'PUT',
      url: `/system/sso/config/${row.provider}/enabled`,
      data: { enabled },
    })
    ElMessage.success(t(enabled ? 'view.ssoConfig.enabled' : 'view.ssoConfig.disabled'))
    await reload()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.enableFailed'))
    await reload()
  }
}

function openSecret(row: SsoConfigRow): void {
  secretDialog.provider = row.provider
  secretDialog.appSecret = ''
  secretDialog.visible = true
}

async function saveSecret(): Promise<void> {
  if (!secretDialog.appSecret.trim()) {
    ElMessage.warning(t('view.ssoConfig.secretRequired'))
    return
  }
  secretDialog.saving = true
  try {
    await request({
      method: 'PUT',
      url: `/system/sso/config/${secretDialog.provider}/secret`,
      data: { appSecret: secretDialog.appSecret },
    })
    ElMessage.success(t('view.ssoConfig.secretSaved'))
    secretDialog.visible = false
    await reload()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.secretFailed'))
  } finally {
    secretDialog.saving = false
  }
}

async function runCheck(row: SsoConfigRow): Promise<void> {
  try {
    const data = await request<CheckResult>({
      method: 'GET',
      url: `/system/sso/config/${row.provider}/check`,
    })
    checkDialog.provider = row.provider
    checkDialog.result = data
    checkDialog.visible = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.checkFailed'))
  }
}

async function openAudit(): Promise<void> {
  auditDrawer.visible = true
  auditDrawer.loading = true
  try {
    const data = await request<{ records: AuditRecord[] }>({
      method: 'GET',
      url: '/auth/sso/audit',
      params: { page: 0, size: 50 },
    })
    auditDrawer.records = data.records
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('view.ssoConfig.auditLoadFailed'))
  } finally {
    auditDrawer.loading = false
  }
}

function checkLabel(key: string): string {
  return t(`view.ssoConfig.checks.${key}`)
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="sso-config">
    <div class="page-head">
      <h2>{{ t('view.ssoConfig.title') }}</h2>
      <div class="head-actions">
        <el-button v-perm="'system:sso:audit:query'" @click="openAudit">
          {{ t('view.ssoConfig.audit') }}
        </el-button>
      </div>
    </div>
    <p class="desc">{{ t('view.ssoConfig.desc') }}</p>

    <el-table v-loading="loading" :data="rows" class="config-table">
      <el-table-column :label="t('view.ssoConfig.provider')" width="130">
        <template #default="{ row }">
          {{ labelOf(row.provider) }}
          <el-tag v-if="row.deferred" size="small" type="info" class="deferred-tag">
            {{ t('view.ssoConfig.deferred') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="appId"
        :label="t('view.ssoConfig.appId')"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('view.ssoConfig.identityMode')" width="200">
        <template #default="{ row }">
          <el-tag :type="row.identityMode === 'enterprise' ? 'warning' : 'info'" size="small">
            {{ t(`view.ssoConfig.modes.${row.identityMode}`) }}
          </el-tag>
          <span v-if="row.identityMode === 'enterprise'" class="ent-id">{{
            row.configuredEnterpriseId
          }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('view.ssoConfig.credential')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.secretConfigured ? 'success' : 'danger'" size="small">
            {{
              t(
                row.secretConfigured
                  ? 'view.ssoConfig.secretConfigured'
                  : 'view.ssoConfig.secretMissing',
              )
            }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('view.ssoConfig.enabledLabel')" width="90">
        <template #default="{ row }">
          <el-switch
            v-perm="'system:sso:config:enable'"
            :model-value="row.enabled"
            :disabled="row.deferred"
            @change="
              (value: string | number | boolean) =>
                onToggleEnabled(row as SsoConfigRow, value === true)
            "
          />
        </template>
      </el-table-column>
      <el-table-column
        prop="callbackUrl"
        :label="t('view.ssoConfig.callbackUrl')"
        min-width="300"
        show-overflow-tooltip
      />
      <el-table-column
        prop="updateTime"
        :label="t('view.ssoConfig.updateTime')"
        width="170"
        show-overflow-tooltip
      />
      <el-table-column :label="t('view.ssoConfig.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="!row.deferred"
            v-perm="'system:sso:config:edit'"
            link
            type="primary"
            @click="openEdit(row as SsoConfigRow)"
          >
            {{ t('view.ssoConfig.edit') }}
          </el-button>
          <el-button
            v-if="!row.deferred"
            v-perm="'system:sso:config:secret'"
            link
            type="primary"
            @click="openSecret(row as SsoConfigRow)"
          >
            {{ t('view.ssoConfig.updateSecret') }}
          </el-button>
          <el-button link type="primary" @click="runCheck(row as SsoConfigRow)">{{
            t('view.ssoConfig.check')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="editDialog.visible"
      :title="t('view.ssoConfig.editTitle', { provider: labelOf(editDialog.provider) })"
      width="480px"
    >
      <el-form label-width="120px">
        <el-form-item :label="t('view.ssoConfig.appId')">
          <el-input
            v-model="editDialog.appId"
            :placeholder="t('view.ssoConfig.appIdPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('view.ssoConfig.identityMode')">
          <el-radio-group v-model="editDialog.mode">
            <el-radio value="personal">{{ t('view.ssoConfig.modes.personal') }}</el-radio>
            <el-radio value="enterprise">{{ t('view.ssoConfig.modes.enterprise') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item
          v-if="editDialog.mode === 'enterprise'"
          :label="t('view.ssoConfig.enterpriseId')"
          required
        >
          <el-input
            v-model="editDialog.enterpriseId"
            :placeholder="t('view.ssoConfig.enterpriseIdPlaceholder')"
          />
        </el-form-item>
        <el-form-item v-else>
          <span class="mode-hint">{{ t('view.ssoConfig.personalHint') }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog.visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="editDialog.saving" @click="saveEdit">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="secretDialog.visible"
      :title="t('view.ssoConfig.secretTitle', { provider: labelOf(secretDialog.provider) })"
      width="480px"
    >
      <el-form label-width="120px">
        <el-form-item :label="t('view.ssoConfig.newSecret')" required>
          <el-input
            v-model="secretDialog.appSecret"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="t('view.ssoConfig.newSecretPlaceholder')"
          />
        </el-form-item>
        <el-form-item>
          <span class="mode-hint">{{ t('view.ssoConfig.secretHint') }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="secretDialog.visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="secretDialog.saving" @click="saveSecret">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="checkDialog.visible"
      :title="t('view.ssoConfig.checkTitle', { provider: labelOf(checkDialog.provider) })"
      width="520px"
    >
      <template v-if="checkDialog.result">
        <div class="check-list">
          <div
            v-for="key in ['configExists', 'appIdValid', 'secretUsable', 'enabled']"
            :key="key"
            class="check-item"
          >
            <span :class="checkDialog.result[key as keyof CheckResult] ? 'ok' : 'bad'">
              {{ checkDialog.result[key as keyof CheckResult] ? '✓' : '✗' }}
            </span>
            {{ checkLabel(key) }}
          </div>
        </div>
        <p class="check-summary">{{ checkDialog.result.summary }}</p>
        <p class="check-note">{{ t('view.ssoConfig.checkNote') }}</p>
      </template>
      <template #footer>
        <el-button @click="checkDialog.visible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="auditDrawer.visible" :title="t('view.ssoConfig.auditTitle')" size="560px">
      <el-table v-loading="auditDrawer.loading" :data="auditDrawer.records" size="small">
        <el-table-column
          prop="createTime"
          :label="t('view.ssoConfig.auditTime')"
          width="170"
          show-overflow-tooltip
        />
        <el-table-column :label="t('view.ssoConfig.provider')" width="90">
          <template #default="{ row }">{{ labelOf(row.provider) }}</template>
        </el-table-column>
        <el-table-column
          prop="eventType"
          :label="t('view.ssoConfig.auditEvent')"
          width="160"
          show-overflow-tooltip
        />
        <el-table-column
          prop="result"
          :label="t('view.ssoConfig.auditResult')"
          width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="detail"
          :label="t('view.ssoConfig.auditDetail')"
          show-overflow-tooltip
        />
      </el-table>
    </el-drawer>
  </div>
</template>

<style scoped>
.sso-config {
  padding: 24px;
}
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}
.desc {
  font-size: 13px;
  color: #909399;
  margin: 8px 0 16px;
}
.config-table {
  background: #fff;
  border-radius: 6px;
}
.deferred-tag {
  margin-left: 6px;
}
.ent-id {
  margin-left: 6px;
  font-size: 12px;
  color: #909399;
}
.mode-hint {
  font-size: 12px;
  color: #909399;
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.check-item .ok {
  color: #67c23a;
  margin-right: 8px;
}
.check-item .bad {
  color: #f56c6c;
  margin-right: 8px;
}
.check-summary {
  font-size: 13px;
  color: #303133;
  margin: 0 0 8px;
}
.check-note {
  font-size: 12px;
  color: #909399;
  margin: 0;
}
</style>
