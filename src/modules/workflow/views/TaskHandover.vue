<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TaskHandover — 流程交接（I4 §3.6）。
 * 向导式：来源/目标用户 + 流程范围 + 代理规则显式勾选；逐项清单可复核；
 * 历史与抄送零改写；失败项可安全重试（已迁移任务自动跳过）。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  submitHandover,
  queryHandoverItems,
  type HandoverResult,
  type HandoverItem,
} from '@/modules/workflow/api/i4'
import { ApiError } from '@/foundation/request'

const fromUserId = ref<number | undefined>()
const toUserId = ref<number | undefined>()
const scopeText = ref('')
const includeProxyRules = ref(false)
const submitting = ref(false)
const result = ref<HandoverResult | null>(null)
const items = ref<HandoverItem[]>([])

async function submit() {
  if (!fromUserId.value || !toUserId.value) {
    ElMessage.warning(t('workflow.handoverFillUserIds'))
    return
  }
  submitting.value = true
  try {
    result.value = await submitHandover({
      fromUserId: fromUserId.value,
      toUserId: toUserId.value,
      scopeDefKeys: scopeText.value
        ? scopeText.value
            .split(',')
            .map((key) => key.trim())
            .filter(Boolean)
        : undefined,
      includeProxyRules: includeProxyRules.value,
    })
    items.value = await queryHandoverItems(result.value.id)
    ElMessage.success(t('workflow.handoverExecuted'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.handoverFailed'))
  } finally {
    submitting.value = false
  }
}

function resultTag(resultValue: HandoverItem['result']) {
  return resultValue === 'MIGRATED' ? 'success' : resultValue === 'FAILED' ? 'danger' : 'info'
}

function resultLabel(resultValue: HandoverItem['result']) {
  return (
    {
      get MIGRATED() {
        return t('workflow.handoverMigrated')
      },
      get FAILED() {
        return t('common.resultFailed')
      },
      get SKIPPED() {
        return t('workflow.handoverSkipped')
      },
      get SKIPPED_ALREADY_MIGRATED() {
        return t('workflow.handoverAlreadyMigrated')
      },
    }[resultValue] ?? resultValue
  )
}
</script>

<template>
  <div class="handover-page">
    <h2 class="page-title">{{ t('workflow.handoverTitle') }}</h2>
    <el-card shadow="never" class="form-card">
      <el-form label-width="130px">
        <el-form-item :label="t('workflow.sourceUserId')">
          <el-input-number v-model="fromUserId" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('workflow.targetUserId')">
          <el-input-number v-model="toUserId" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('workflow.processScope')">
          <el-input v-model="scopeText" :placeholder="t('workflow.processScopePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('workflow.carryOverDelegateRules')">
          <el-switch v-model="includeProxyRules" />
          <span class="hint">{{ t('workflow.carryOverDelegateHint') }}</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">{{
            t('workflow.runHandover')
          }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="result" shadow="never" class="result-card">
      <template #header>
        {{
          t('workflow.handoverSummary', {
            id: result.id,
            status: enumLabel('HANDOVER_RESULT', result.status),
            migrated: result.migratedItems,
            failed: result.failedItems,
            total: result.totalItems,
          })
        }}
      </template>
      <el-table :data="items" size="small">
        <el-table-column prop="itemType" :label="t('common.type')" width="110" />
        <el-table-column prop="taskId" :label="t('common.taskId')" min-width="170" />
        <el-table-column prop="beforeAssignee" :label="t('workflow.previousOwner')" width="100" />
        <el-table-column prop="afterAssignee" :label="t('workflow.newOwner')" width="100" />
        <el-table-column :label="t('common.result')" width="150">
          <template #default="{ row }">
            <el-tag :type="resultTag(row.result)">{{ resultLabel(row.result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="failReason" :label="t('common.failureReason')" min-width="180" />
        <template #empty>{{ t('workflow.handoverEmpty') }}</template>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.handover-page {
  padding: 16px 24px;
  max-width: 1100px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-text-primary, #303133);
  margin: 0 0 16px;
}
.form-card {
  margin-bottom: 16px;
}
.result-card {
  margin-bottom: 16px;
}
.hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
