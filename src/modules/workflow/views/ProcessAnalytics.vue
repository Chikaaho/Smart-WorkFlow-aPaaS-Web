<script setup lang="ts">
/**
 * ProcessAnalytics — 流程基础分析（I4 §3.3）。
 * 发起/完成/运行/驳回、平均与分位耗时（可复算口径）、节点停留与办理人工作量。
 * 汇总与明细同受数据范围约束（服务端）。
 */
import { ref, computed, onMounted } from 'vue'
import { queryAnalyticsSummary, type AnalyticsSummary } from '@/modules/workflow/api/i4'
import { ApiError } from '@/foundation/request'

const summary = ref<AnalyticsSummary | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const processDefKey = ref('')

const nodeEntries = computed(() =>
  Object.entries(summary.value?.nodeStats ?? {}).map(([nodeKey, stat]) => ({ nodeKey, ...stat })),
)
const workloadEntries = computed(() =>
  Object.entries(summary.value?.handlerWorkload ?? {}).map(([userId, count]) => ({
    userId,
    count,
  })),
)

function formatMs(value: number | undefined): string {
  if (!value) return '—'
  if (value < 1000) return `${value}ms`
  if (value < 60000) return `${(value / 1000).toFixed(1)}s`
  return `${(value / 60000).toFixed(1)}min`
}

async function loadSummary() {
  loading.value = true
  errorMsg.value = ''
  try {
    summary.value = await queryAnalyticsSummary({
      processDefKey: processDefKey.value || undefined,
    })
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '分析数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)
</script>

<template>
  <div class="analytics-page">
    <h2 class="page-title">流程分析</h2>
    <div class="filter-bar">
      <el-input
        v-model="processDefKey"
        placeholder="流程定义 Key（可空=全部）"
        clearable
        style="width: 240px"
        @keyup.enter="loadSummary"
      />
      <el-button type="primary" :loading="loading" @click="loadSummary">查询</el-button>
    </div>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" />

    <template v-if="summary">
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ summary.launched }}</div>
            <div class="stat-label">发起量</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ summary.completed }}</div>
            <div class="stat-label">完成量</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ summary.running }}</div>
            <div class="stat-label">运行中</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ summary.rejected }}</div>
            <div class="stat-label">驳回</div>
          </div></el-col
        >
      </el-row>
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ formatMs(summary.avgDurationMs) }}</div>
            <div class="stat-label">平均耗时</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ formatMs(summary.p50DurationMs) }}</div>
            <div class="stat-label">P50 耗时</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ formatMs(summary.p90DurationMs) }}</div>
            <div class="stat-label">P90 耗时</div>
          </div></el-col
        >
        <el-col :span="6"
          ><div class="stat-card">
            <div class="stat-value">{{ summary.durationSample }}</div>
            <div class="stat-label">耗时样本数</div>
          </div></el-col
        >
      </el-row>

      <el-row :gutter="16" class="stat-row">
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>节点停留（瓶颈）</template>
            <el-table :data="nodeEntries" size="small" max-height="320">
              <el-table-column prop="nodeKey" label="节点" min-width="140" />
              <el-table-column prop="count" label="样本" width="80" />
              <el-table-column label="平均停留" width="110">
                <template #default="{ row }">{{ formatMs(row.avgStayMs) }}</template>
              </el-table-column>
              <el-table-column label="P90 停留" width="110">
                <template #default="{ row }">{{ formatMs(row.p90StayMs) }}</template>
              </el-table-column>
              <template #empty>暂无数据</template>
            </el-table>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>办理人工作量</template>
            <el-table :data="workloadEntries" size="small" max-height="320">
              <el-table-column prop="userId" label="用户 ID" min-width="120" />
              <el-table-column prop="count" label="动作次数" width="120" />
              <template #empty>暂无数据</template>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<style scoped>
.analytics-page {
  padding: 16px 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-text-primary, #303133);
  margin: 0 0 16px;
}
.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-row {
  margin-bottom: 16px;
}
.stat-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 16px;
  text-align: center;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #7e306b;
}
.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
  margin-top: 4px;
}
</style>
