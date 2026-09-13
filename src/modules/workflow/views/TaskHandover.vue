<script setup lang="ts">
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
    ElMessage.warning('请填写来源与目标用户 ID')
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
    ElMessage.success('交接已执行，清单如下')
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '交接执行失败')
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
      MIGRATED: '已迁移',
      FAILED: '失败',
      SKIPPED: '跳过',
      SKIPPED_ALREADY_MIGRATED: '已迁移（跳过重复）',
    }[resultValue] ?? resultValue
  )
}
</script>

<template>
  <div class="handover-page">
    <h2 class="page-title">流程交接</h2>
    <el-card shadow="never" class="form-card">
      <el-form label-width="130px">
        <el-form-item label="来源用户 ID">
          <el-input-number v-model="fromUserId" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="目标用户 ID">
          <el-input-number v-model="toUserId" :min="1" controls-position="right" />
        </el-form-item>
        <el-form-item label="流程范围">
          <el-input v-model="scopeText" placeholder="processDefKey，逗号分隔；留空=全部范围" />
        </el-form-item>
        <el-form-item label="随迁代理规则">
          <el-switch v-model="includeProxyRules" />
          <span class="hint">仅有效期内的未来代理规则随迁；历史/抄送/已办永不迁移</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">执行交接</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="result" shadow="never" class="result-card">
      <template #header>
        交接清单 #{{ result.id }} — {{ result.status }}（迁移 {{ result.migratedItems }} / 失败
        {{ result.failedItems }} / 共 {{ result.totalItems }}）
      </template>
      <el-table :data="items" size="small">
        <el-table-column prop="itemType" label="类型" width="110" />
        <el-table-column prop="taskId" label="任务 ID" min-width="170" />
        <el-table-column prop="beforeAssignee" label="原责任人" width="100" />
        <el-table-column prop="afterAssignee" label="新责任人" width="100" />
        <el-table-column label="结果" width="150">
          <template #default="{ row }">
            <el-tag :type="resultTag(row.result)">{{ resultLabel(row.result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="failReason" label="失败原因" min-width="180" />
        <template #empty>本次交接无迁移项</template>
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
