<script setup lang="ts">
/**
 * TxnBatchConsole — 后台批量受控动作调用控制台（P62 分级执行 S3/S5，页型B变体）。
 *
 * 受控动作批量调用：受理（1—500 项，稳定项键）→ 异步执行 → 按批次键回查逐项结果。
 * 受理为异步语义：受理成功仅代表批次已持久化并入队，不表示项已完成；
 * 同批次键再次受理即批次重放，返回原批次（replay=true），已成功项不重做。
 *
 * 呈现原则：状态用可读文案；不暴露队列、租约、调度等内部概念；
 * 批次/项标识仅在业务回查确需处出现。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { StandardFormTemplate } from '@/components/page-layout'
import {
  submitTxnBatch,
  getTxnBatch,
  type TxnBatchView,
  type TxnBatchItemReq,
} from '@/modules/workflow/api/txn-batch'

const INVOKE_PERM = 'form:action:invoke'
const canSubmit = computed(() => hasPerm(INVOKE_PERM))

/* ─── 批量受理 ─── */

const submitBatchKey = ref('')
const submitActionId = ref('')
interface ItemDraft {
  itemKey: string
  recordId: string
  quantity: string
}
const itemDrafts = ref<ItemDraft[]>([emptyDraft()])

function emptyDraft(): ItemDraft {
  return { itemKey: '', recordId: '', quantity: '1' }
}

function addItem(): void {
  if (itemDrafts.value.length >= 500) {
    ElMessage.warning('单批最多 500 项')
    return
  }
  itemDrafts.value.push(emptyDraft())
}

function removeItem(index: number): void {
  itemDrafts.value.splice(index, 1)
}

const lastSubmittedKey = ref('')
const accepting = ref(false)

async function submitBatch(): Promise<void> {
  const batchKey = submitBatchKey.value.trim()
  const actionId = submitActionId.value.trim()
  if (!batchKey || !actionId) {
    ElMessage.warning('请填写批次键与动作标识')
    return
  }
  const items: TxnBatchItemReq[] = []
  const seen = new Set<string>()
  for (const draft of itemDrafts.value) {
    const itemKey = draft.itemKey.trim()
    const recordId = draft.recordId.trim()
    const quantity = draft.quantity.trim()
    if (!itemKey || !recordId || !quantity) {
      ElMessage.warning('每项的项键 / 记录标识 / 数量均必填')
      return
    }
    if (seen.has(itemKey)) {
      ElMessage.warning(`项键重复：${itemKey}`)
      return
    }
    seen.add(itemKey)
    items.push({ itemKey, recordId, quantity })
  }
  if (items.length < 1) {
    ElMessage.warning('至少填写 1 项')
    return
  }
  accepting.value = true
  try {
    const view = await submitTxnBatch({ batchKey, actionId, items })
    if (view.replay) {
      ElMessage.info('该批次键已存在：已返回原批次，未重复执行（已成功项不重做）')
    } else {
      ElMessage.success('批量受理成功：批次已持久化并入队，结果请回查（受理成功 ≠ 项已完成）')
    }
    lastSubmittedKey.value = view.batchKey
    await lookupBatch(view.batchKey)
  } catch (error) {
    if (error instanceof ApiError) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('批量受理失败，请稍后重试')
    }
  } finally {
    accepting.value = false
  }
}

/* ─── 批次回查 ─── */

const lookupKey = ref('')
const batch = ref<TxnBatchView | null>(null)
const loading = ref(false)

async function lookupBatch(key?: string): Promise<void> {
  const target = (key ?? lookupKey.value).trim()
  if (!target) {
    ElMessage.warning('请输入批次键')
    return
  }
  loading.value = true
  try {
    batch.value = await getTxnBatch(target)
  } catch (error) {
    batch.value = null
    if (error instanceof ApiError) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('批次回查失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}

const BATCH_STATUS_TEXT: Record<string, string> = {
  PENDING: '待执行',
  PROCESSING: '执行中',
  COMPLETED: '全部成功',
  PARTIALLY_FAILED: '部分失败',
}
const ITEM_STATUS_TEXT: Record<string, string> = {
  PENDING: '待执行',
  SUCCEEDED: '成功',
  REJECTED: '已拒绝',
}

function batchStatusText(status: string | null | undefined): string {
  return (status && BATCH_STATUS_TEXT[status]) || (status ?? '—')
}

function itemStatusText(status: string | null | undefined): string {
  return (status && ITEM_STATUS_TEXT[status]) || (status ?? '—')
}

function statusTagType(
  status: string | null | undefined,
): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'COMPLETED':
    case 'SUCCEEDED':
      return 'success'
    case 'PROCESSING':
    case 'PENDING':
      return 'warning'
    case 'PARTIALLY_FAILED':
    case 'REJECTED':
      return 'danger'
    default:
      return 'info'
  }
}
</script>

<template>
  <StandardFormTemplate
    title="后台批量调用"
    subtitle="受控动作批量调用：受理为异步语义，结果按批次键回查；同批次键重放返回原批次，已成功项不重做"
  >
    <template #alert>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="每批 1—500 项；项键批次内唯一且为稳定键（重试/重放按项键幂等，不产生第二次业务效果）"
      />
    </template>

    <!-- 批量受理 -->
    <section class="batch-section">
      <h2 class="batch-section__title">批量受理</h2>
      <el-form label-width="110px" class="batch-form" @submit.prevent>
        <el-form-item label="批次键" required>
          <el-input
            v-model="submitBatchKey"
            placeholder="同租户唯一，如 batch-20260930-01"
            data-test="batch-key-input"
            :disabled="!canSubmit"
          />
        </el-form-item>
        <el-form-item label="动作标识" required>
          <el-input
            v-model="submitActionId"
            placeholder="已发布事务动作的标识"
            data-test="batch-action-input"
            :disabled="!canSubmit"
          />
        </el-form-item>
      </el-form>

      <el-table :data="itemDrafts" size="small" data-test="batch-items-table">
        <el-table-column label="项键（批次内唯一）" min-width="160">
          <template #default="{ $index }">
            <el-input
              v-model="itemDrafts[$index]!.itemKey"
              :data-test="`item-key-${$index}`"
              :disabled="!canSubmit"
            />
          </template>
        </el-table-column>
        <el-table-column label="目标记录标识" min-width="180">
          <template #default="{ $index }">
            <el-input
              v-model="itemDrafts[$index]!.recordId"
              :data-test="`item-record-${$index}`"
              :disabled="!canSubmit"
            />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="120">
          <template #default="{ $index }">
            <el-input
              v-model="itemDrafts[$index]!.quantity"
              :data-test="`item-qty-${$index}`"
              :disabled="!canSubmit"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ $index }">
            <el-button
              link
              type="danger"
              :data-test="`item-remove-${$index}`"
              :disabled="!canSubmit || itemDrafts.length <= 1"
              @click="removeItem($index)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="batch-section__actions">
        <el-button :data-test="'batch-add-item'" :disabled="!canSubmit" @click="addItem">
          添加一项
        </el-button>
        <el-button
          type="primary"
          data-test="batch-submit"
          :loading="accepting"
          :disabled="!canSubmit"
          @click="submitBatch"
        >
          受理批量调用
        </el-button>
        <span v-if="!canSubmit" class="batch-section__hint">无调用权限（form:action:invoke）</span>
      </div>
    </section>

    <!-- 批次回查 -->
    <section class="batch-section">
      <h2 class="batch-section__title">批次回查</h2>
      <div class="batch-lookup">
        <el-input
          v-model="lookupKey"
          :placeholder="lastSubmittedKey || '输入批次键回查'"
          data-test="lookup-key-input"
          class="batch-lookup__input"
          @keyup.enter="lookupBatch()"
        />
        <el-button
          type="primary"
          data-test="lookup-button"
          :loading="loading"
          @click="lookupBatch()"
        >
          回查
        </el-button>
      </div>

      <template v-if="batch">
        <el-descriptions :column="3" border class="batch-summary" data-test="batch-summary">
          <el-descriptions-item label="批次键">{{ batch.batchKey }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(batch.status)" data-test="batch-status">
              {{ batchStatusText(batch.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="重放标记">
            {{ batch.replay ? '本响应为重放（原批次）' : '首次受理' }}
          </el-descriptions-item>
          <el-descriptions-item label="绑定动作">{{ batch.actionId }}</el-descriptions-item>
          <el-descriptions-item label="动作版本">
            {{ batch.actionVersion ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="命令标识">
            {{ batch.commandId ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="成功 / 失败 / 总数" data-test="batch-counters">
            {{ batch.succeededCount ?? 0 }} / {{ batch.failedCount ?? 0 }} /
            {{ batch.totalCount ?? 0 }}
          </el-descriptions-item>
        </el-descriptions>

        <el-table :data="batch.items ?? []" size="small" data-test="batch-result-table">
          <el-table-column prop="itemKey" label="项键" min-width="140" />
          <el-table-column prop="recordId" label="记录标识" min-width="160" />
          <el-table-column prop="quantity" label="数量" width="90" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)">{{ itemStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="invocationId" label="调用记录" min-width="150">
            <template #default="{ row }">{{ row.invocationId ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="结果 / 失败原因" min-width="220">
            <template #default="{ row }">
              <span v-if="row.errorCode" class="batch-error">
                [{{ row.errorCode }}] {{ row.errorMsg ?? '' }}
              </span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column prop="attemptCount" label="尝试" width="70">
            <template #default="{ row }">{{ row.attemptCount ?? 0 }}</template>
          </el-table-column>
        </el-table>
      </template>
    </section>
  </StandardFormTemplate>
</template>

<style scoped>
.batch-section {
  margin-bottom: 20px;
}
.batch-section__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-color-primary, #7e306b);
  border-bottom: 1px solid var(--el-border-color-light, #ebeef5);
  padding-bottom: 8px;
  margin: 0 0 16px;
}
.batch-form {
  max-width: 640px;
}
.batch-section__actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-section__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
.batch-lookup {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.batch-lookup__input {
  max-width: 360px;
}
.batch-summary {
  margin-bottom: 16px;
}
.batch-error {
  color: var(--el-color-danger, #f56c6c);
}
</style>
