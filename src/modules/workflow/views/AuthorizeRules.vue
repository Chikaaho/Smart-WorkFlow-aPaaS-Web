<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Connection, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { hasPerm } from '@/foundation/permission'
import { ApiError } from '@/foundation/request'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import {
  createAuthorizeRule,
  listAuthorizeRules,
  pageProcessDefs,
  revokeAuthorizeRule,
  type AuthorizeRule,
  type AuthorizeRuleInput,
} from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'

const { t } = useI18n()
const canAuthorize = computed(
  () => hasPerm('workflow:task:authorize') || hasPerm('workflow:def:design'),
)

const rows = ref<AuthorizeRule[]>([])
const processDefs = ref<ProcessDef[]>([])
const loading = ref(false)
const submitting = ref(false)
const revokingId = ref<string | null>(null)
const errorMsg = ref('')

const form = reactive<{
  targetUserId: string
  scopeType: AuthorizeRuleInput['scopeType']
  processDefKey: string
  nodeKey: string
  businessKey: string
  startAt: string
  endAt: string
}>({
  targetUserId: '',
  scopeType: 'PROCESS',
  processDefKey: '',
  nodeKey: '',
  businessKey: '',
  startAt: '',
  endAt: '',
})

const scopeOptions = computed(() => [
  { value: 'GLOBAL', label: t('workflow.authorizeScopeGlobal') },
  { value: 'PROCESS', label: t('workflow.authorizeScopeProcess') },
  { value: 'NODE', label: t('workflow.authorizeScopeNode') },
  { value: 'BUSINESS', label: t('workflow.authorizeScopeBusiness') },
])

const processByKey = computed(
  () => new Map(processDefs.value.map((item) => [item.processKey, item])),
)

function scopeLabel(scope: string): string {
  return scopeOptions.value.find((option) => option.value === scope)?.label ?? scope
}

function processLabel(key?: string | null): string {
  if (!key) return '—'
  return processByKey.value.get(key)?.name || key
}

function statusLabel(status: string): string {
  const key = `workflow.authorizeStatus${status.charAt(0)}${status.slice(1).toLowerCase()}`
  const translated = t(key)
  return translated === key ? status : translated
}

function onScopeChange(): void {
  if (form.scopeType === 'GLOBAL') {
    form.processDefKey = ''
    form.nodeKey = ''
    form.businessKey = ''
  }
  if (form.scopeType !== 'NODE') form.nodeKey = ''
  if (form.scopeType !== 'BUSINESS') form.businessKey = ''
}

async function loadList(): Promise<void> {
  if (!canAuthorize.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    rows.value = await listAuthorizeRules()
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.msg : t('workflow.authorizeLoadFailed')
  } finally {
    loading.value = false
  }
}

async function loadProcessDefs(): Promise<void> {
  if (!canAuthorize.value) return
  try {
    const page = await pageProcessDefs({ pageNum: 1, pageSize: 200 })
    processDefs.value = page.list
  } catch {
    processDefs.value = []
  }
}

function validateForm(): string {
  if (!form.targetUserId) return t('workflow.authorizeAgentRequired')
  if (form.scopeType !== 'GLOBAL' && !form.processDefKey.trim())
    return t('workflow.authorizeProcessRequired')
  if (form.scopeType === 'NODE' && !form.nodeKey.trim()) return t('workflow.authorizeNodeRequired')
  if (form.scopeType === 'BUSINESS' && !form.businessKey.trim())
    return t('workflow.authorizeBusinessRequired')
  if (Boolean(form.startAt) !== Boolean(form.endAt)) return t('workflow.authorizePeriodRequired')
  if (form.startAt && form.endAt && form.endAt <= form.startAt)
    return t('workflow.authorizePeriodInvalid')
  return ''
}

function buildPayload(): AuthorizeRuleInput {
  return {
    targetUserId: form.targetUserId,
    scopeType: form.scopeType,
    ...(form.scopeType !== 'GLOBAL' ? { processDefKey: form.processDefKey.trim() } : {}),
    ...(form.scopeType === 'NODE' ? { nodeKey: form.nodeKey.trim() } : {}),
    ...(form.scopeType === 'BUSINESS' ? { businessKey: form.businessKey.trim() } : {}),
    ...(form.startAt ? { startAt: form.startAt, endAt: form.endAt } : {}),
  }
}

function resetForm(): void {
  Object.assign(form, {
    targetUserId: '',
    scopeType: 'PROCESS',
    processDefKey: '',
    nodeKey: '',
    businessKey: '',
    startAt: '',
    endAt: '',
  })
}

async function submit(): Promise<void> {
  if (!canAuthorize.value || submitting.value) return
  const message = validateForm()
  if (message) {
    ElMessage.warning(message)
    return
  }
  submitting.value = true
  try {
    await createAuthorizeRule(buildPayload())
    ElMessage.success(t('workflow.authorizeCreated'))
    resetForm()
    await loadList()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.msg : t('workflow.authorizeCreateFailed'))
  } finally {
    submitting.value = false
  }
}

async function revoke(row: AuthorizeRule): Promise<void> {
  if (!canAuthorize.value || revokingId.value) return
  try {
    await ElMessageBox.confirm(
      t('workflow.authorizeRevokeConfirm'),
      t('workflow.authorizeRevokeTitle'),
      {
        confirmButtonText: t('workflow.authorizeRevokeAction'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      },
    )
  } catch {
    return
  }
  revokingId.value = row.id
  try {
    await revokeAuthorizeRule(row.id)
    ElMessage.success(t('workflow.authorizeRevoked'))
    await loadList()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.msg : t('workflow.authorizeRevokeFailed'))
  } finally {
    revokingId.value = null
  }
}

function revokeRow(raw: unknown): void {
  void revoke(raw as AuthorizeRule)
}

onMounted(() => {
  void Promise.all([loadList(), loadProcessDefs()])
})
</script>

<template>
  <section class="authorize-page">
    <header class="authorize-page__header">
      <div>
        <h1>{{ t('workflow.authorizeRulesTitle') }}</h1>
        <p>{{ t('workflow.authorizeRulesHint') }}</p>
      </div>
    </header>

    <el-alert
      v-if="!canAuthorize"
      type="error"
      :title="t('workflow.authorizeNoPermission')"
      :closable="false"
      show-icon
    />
    <el-alert v-else-if="errorMsg" type="error" :title="errorMsg" :closable="false" show-icon />

    <el-card v-if="canAuthorize" shadow="never" class="authorize-card">
      <template #header>
        <div class="authorize-card__header">
          <span>{{ t('workflow.authorizeCreateTitle') }}</span>
          <el-button :icon="Connection" :loading="submitting" type="primary" @click="submit">
            {{ t('workflow.authorizeCreateAction') }}
          </el-button>
        </div>
      </template>
      <el-form label-position="top" class="authorize-form">
        <el-form-item :label="t('workflow.authorizeAgentLabel')" required>
          <UserRemoteSelect
            v-model="form.targetUserId"
            :placeholder="t('workflow.authorizeAgentPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('workflow.authorizeScopeLabel')" required>
          <el-select v-model="form.scopeType" @change="onScopeChange">
            <el-option
              v-for="option in scopeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="form.scopeType !== 'GLOBAL'"
          :label="t('workflow.authorizeProcessLabel')"
          required
        >
          <el-select v-model="form.processDefKey" filterable clearable>
            <el-option
              v-for="item in processDefs"
              :key="item.id"
              :label="`${item.name}（${item.processKey}）`"
              :value="item.processKey"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="form.scopeType === 'NODE'"
          :label="t('workflow.authorizeNodeLabel')"
          required
        >
          <el-input v-model="form.nodeKey" :placeholder="t('workflow.authorizeNodePlaceholder')" />
        </el-form-item>
        <el-form-item
          v-if="form.scopeType === 'BUSINESS'"
          :label="t('workflow.authorizeBusinessLabel')"
          required
        >
          <el-input
            v-model="form.businessKey"
            :placeholder="t('workflow.authorizeBusinessPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('workflow.authorizeStartLabel')">
          <el-date-picker
            v-model="form.startAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            :placeholder="t('workflow.authorizeStartPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('workflow.authorizeEndLabel')">
          <el-date-picker
            v-model="form.endAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            :placeholder="t('workflow.authorizeEndPlaceholder')"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="canAuthorize" shadow="never" class="authorize-card">
      <template #header>{{ t('workflow.authorizeListTitle') }}</template>
      <el-table
        :key="rows.map((rule) => rule.id).join('|')"
        v-loading="loading"
        :data="rows"
        :empty-text="t('workflow.authorizeEmpty')"
      >
        <el-table-column :label="t('workflow.authorizePrincipalColumn')" min-width="140">
          <template #default="{ row }">{{ row.principalId }}</template>
        </el-table-column>
        <el-table-column :label="t('workflow.authorizeAgentColumn')" min-width="140">
          <template #default="{ row }">{{ row.agentId }}</template>
        </el-table-column>
        <el-table-column :label="t('workflow.authorizeScopeColumn')" min-width="180">
          <template #default="{ row }">
            {{ scopeLabel(row.scopeType) }}
            <span v-if="row.scopeType !== 'GLOBAL'" class="authorize-page__detail">
              · {{ processLabel(row.processDefKey) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column :label="t('workflow.authorizePeriodColumn')" min-width="220">
          <template #default="{ row }">{{ row.startAt || '—' }} ~ {{ row.endAt || '—' }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="100">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column :label="t('common.action')" width="120">
          <template #default="{ row }">
            <el-button
              link
              type="danger"
              :icon="Delete"
              :loading="revokingId === row.id"
              :disabled="revokingId !== null"
              @click="revokeRow(row)"
            >
              {{ t('workflow.authorizeRevokeAction') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<style scoped>
.authorize-page {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
  min-height: 100%;
  padding: var(--sw-space-24);
  box-sizing: border-box;
  background: var(--sw-surface-page);
}
.authorize-page__header h1 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-h1);
  font-weight: var(--sw-font-weight-h1);
}
.authorize-page__header p {
  margin: var(--sw-space-4) 0 0;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
}
.authorize-card {
  border: 1px solid var(--sw-border-lighter);
  border-radius: var(--sw-radius-card);
}
.authorize-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-12);
}
.authorize-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--sw-space-20);
}
.authorize-page__detail {
  color: var(--sw-text-secondary);
}
@media (max-width: 900px) {
  .authorize-form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
