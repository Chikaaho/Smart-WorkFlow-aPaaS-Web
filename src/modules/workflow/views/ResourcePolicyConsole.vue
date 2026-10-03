<script setup lang="ts">
/**
 * ResourcePolicyConsole — P62 资源策略控制台（资源保障 RG01/RG04/RG06）。
 *
 * 版本化资源策略：创建（DRAFT、默认关闭）→ 启用检查（保留份额/消费者/预算相容）
 * → 启用（只影响新受理；在途按受理冻结版本结算）→ 停用 / 停新受理。
 * 查看权限 workflow:resource:view；策略修改/启停需独立管理权限 workflow:resource:manage
 * （服务端强制，前端只做入口裁剪）。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { StandardFormTemplate } from '@/components/page-layout'
import {
  listResourcePolicies,
  createResourcePolicy,
  enableResourcePolicy,
  disableResourcePolicy,
  stopAcceptance,
  checkResourcePolicy,
  type ResourcePolicy,
} from '@/modules/workflow/api/resource-ops'

const VIEW_PERM = 'workflow:resource:view'
const MANAGE_PERM = 'workflow:resource:manage'
const canView = computed(() => hasPerm(VIEW_PERM))
const canManage = computed(() => hasPerm(MANAGE_PERM))

const policies = ref<ResourcePolicy[]>([])
const loading = ref(false)

const STATUS_TEXT: Record<string, string> = {
  DRAFT: '草稿（未启用）',
  ACTIVE: '生效中',
  RETIRED: '已退役',
}

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'ACTIVE') return 'success'
  if (status === 'DRAFT') return 'warning'
  return 'info'
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    policies.value = await listResourcePolicies()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '策略加载失败')
  } finally {
    loading.value = false
  }
}

/* ─── 创建新版本 ─── */

const draft = ref({
  globalMaxOutstanding: 2000,
  tenantMaxOutstanding: 800,
  prodReserved: 400,
  oaReserved: 400,
  sharedCapacity: 1200,
  tenantRatePerSec: 50,
  tenantBurst: 500,
  realtimeGlobalConcurrency: 16,
  realtimeTenantConcurrency: 8,
  batchSliceItems: 25,
  batchPollClaimLimit: 1,
  remark: '',
})
const creating = ref(false)

async function submitCreate(): Promise<void> {
  const d = draft.value
  if (d.prodReserved + d.oaReserved + d.sharedCapacity !== d.globalMaxOutstanding) {
    ElMessage.warning('保留份额不自洽：生产保留 + OA 保留 + 共享 必须等于全局上限')
    return
  }
  creating.value = true
  try {
    await createResourcePolicy({ ...d, remark: d.remark || undefined })
    ElMessage.success('新策略版本已创建（草稿、默认关闭），需通过启用检查后启用')
    await refresh()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '创建失败')
  } finally {
    creating.value = false
  }
}

/* ─── 启用/停用/停受理 ─── */

const actingId = ref<number | null>(null)

async function enable(row: ResourcePolicy | Record<string, unknown>): Promise<void> {
  const policy = row as ResourcePolicy
  actingId.value = policy.id
  try {
    await enableResourcePolicy(policy.id, '经资源策略控制台启用')
    ElMessage.success(`策略版本 ${policy.policyVersion} 已启用（只影响新受理）`)
    await refresh()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '启用失败')
  } finally {
    actingId.value = null
  }
}

async function disable(row: ResourcePolicy | Record<string, unknown>): Promise<void> {
  const policy = row as ResourcePolicy
  actingId.value = policy.id
  try {
    await disableResourcePolicy(policy.id)
    ElMessage.success(`策略版本 ${policy.policyVersion} 已停用（新受理回到无策略行为）`)
    await refresh()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '停用失败')
  } finally {
    actingId.value = null
  }
}

async function toggleStop(row: ResourcePolicy | Record<string, unknown>): Promise<void> {
  const policy = row as ResourcePolicy
  actingId.value = policy.id
  try {
    const next = !policy.stopAcceptance
    await stopAcceptance(policy.id, next)
    ElMessage.success(next ? '已停新受理：已有工作按原合同结算' : '已恢复新受理')
    await refresh()
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '操作失败')
  } finally {
    actingId.value = null
  }
}

async function precheck(row: ResourcePolicy | Record<string, unknown>): Promise<void> {
  const policy = row as ResourcePolicy
  actingId.value = policy.id
  try {
    const violations = await checkResourcePolicy(policy.id)
    if (violations.length === 0) {
      ElMessage.success('启用检查通过')
    } else {
      ElMessage.warning(`启用检查未通过：${violations.join('；')}`)
    }
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '检查失败')
  } finally {
    actingId.value = null
  }
}

onMounted(() => {
  if (canView.value) {
    void refresh()
  }
})
</script>

<template>
  <StandardFormTemplate
    title="资源策略"
    subtitle="版本化额度与并发预算：新策略默认关闭；启用只影响新受理，在途对象按受理冻结版本结算"
  >
    <template #alert>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="保留份额口径：生产保留 + 普通 OA 保留 + 共享 = 全局上限；启用前进行保留份额、消费者可用性与预算相容性检查，失败明确拒绝"
      />
    </template>

    <!-- 新版本创建 -->
    <section v-if="canManage" class="policy-section">
      <h2 class="policy-section__title">创建新策略版本</h2>
      <el-form label-width="150px" class="policy-form" @submit.prevent>
        <el-form-item label="全局上限">
          <el-input-number v-model="draft.globalMaxOutstanding" :min="1" data-test="draft-global" />
        </el-form-item>
        <el-form-item label="每租户上限">
          <el-input-number v-model="draft.tenantMaxOutstanding" :min="1" data-test="draft-tenant" />
        </el-form-item>
        <el-form-item label="生产保留">
          <el-input-number v-model="draft.prodReserved" :min="0" data-test="draft-prod" />
        </el-form-item>
        <el-form-item label="普通 OA 保留">
          <el-input-number v-model="draft.oaReserved" :min="0" data-test="draft-oa" />
        </el-form-item>
        <el-form-item label="共享容量">
          <el-input-number v-model="draft.sharedCapacity" :min="0" data-test="draft-shared" />
        </el-form-item>
        <el-form-item label="租户速率上限（/s）">
          <el-input-number v-model="draft.tenantRatePerSec" :min="1" data-test="draft-rate" />
        </el-form-item>
        <el-form-item label="租户突发额">
          <el-input-number v-model="draft.tenantBurst" :min="1" data-test="draft-burst" />
        </el-form-item>
        <el-form-item label="实时全局并发">
          <el-input-number
            v-model="draft.realtimeGlobalConcurrency"
            :min="1"
            data-test="draft-rt-global"
          />
        </el-form-item>
        <el-form-item label="实时单租户并发">
          <el-input-number
            v-model="draft.realtimeTenantConcurrency"
            :min="1"
            data-test="draft-rt-tenant"
          />
        </el-form-item>
        <el-form-item label="批量切片项数">
          <el-input-number v-model="draft.batchSliceItems" :min="1" data-test="draft-slice" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="draft.remark" data-test="draft-remark" />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="creating"
            data-test="create-btn"
            @click="submitCreate"
          >
            创建版本
          </el-button>
        </el-form-item>
      </el-form>
    </section>

    <!-- 版本列表 -->
    <section class="policy-section">
      <h2 class="policy-section__title">策略版本</h2>
      <el-table v-loading="loading" :data="policies" size="small" data-test="policy-table">
        <el-table-column label="版本" width="70">
          <template #default="{ row }">{{ row.policyVersion }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{
              STATUS_TEXT[row.status] ?? row.status
            }}</el-tag>
            <el-tag v-if="row.stopAcceptance" type="danger" size="small" class="policy-tag"
              >停新受理</el-tag
            >
          </template>
        </el-table-column>
        <el-table-column label="全局/租户上限" min-width="110">
          <template #default="{ row }"
            >{{ row.globalMaxOutstanding }} / {{ row.tenantMaxOutstanding }}</template
          >
        </el-table-column>
        <el-table-column label="保留（生产/OA/共享）" min-width="150">
          <template #default="{ row }">
            {{ row.prodReserved }} / {{ row.oaReserved }} / {{ row.sharedCapacity }}
          </template>
        </el-table-column>
        <el-table-column label="速率（/s）/ 突发" min-width="110">
          <template #default="{ row }">{{ row.tenantRatePerSec }} / {{ row.tenantBurst }}</template>
        </el-table-column>
        <el-table-column label="实时并发（全局/租户）" min-width="140">
          <template #default="{ row }">
            {{ row.realtimeGlobalConcurrency }} / {{ row.realtimeTenantConcurrency }}
          </template>
        </el-table-column>
        <el-table-column v-if="canManage" label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'DRAFT' || row.status === 'RETIRED'"
              link
              type="primary"
              :data-test="`enable-${row.policyVersion}`"
              :loading="actingId === row.id"
              @click="enable(row)"
            >
              启用
            </el-button>
            <el-button
              link
              :data-test="`check-${row.policyVersion}`"
              :loading="actingId === row.id"
              @click="precheck(row)"
            >
              启用检查
            </el-button>
            <el-button
              v-if="row.status === 'ACTIVE'"
              link
              type="warning"
              :data-test="`stop-${row.policyVersion}`"
              :loading="actingId === row.id"
              @click="toggleStop(row)"
            >
              {{ row.stopAcceptance ? '恢复受理' : '停新受理' }}
            </el-button>
            <el-button
              v-if="row.status === 'ACTIVE'"
              link
              type="danger"
              :data-test="`disable-${row.policyVersion}`"
              :loading="actingId === row.id"
              @click="disable(row)"
            >
              停用
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </StandardFormTemplate>
</template>

<style scoped>
.policy-section {
  margin-bottom: 24px;
}

.policy-section__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
}

.policy-form {
  max-width: 520px;
}

.policy-tag {
  margin-left: 6px;
}
</style>
