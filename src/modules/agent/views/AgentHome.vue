<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import {
  pageGraphDefs,
  pageGraphExecutionsWithVersion,
  pageKnowledgeBases,
  pageModels,
  pageProviders,
} from '@/modules/agent/api'
import type { AgentGraphExecution } from '@/contracts/agent'
import { ApiError } from '@/foundation/request'

const router = useRouter()
const { t } = useI18n()
/**
 * Agent 统一工作台：供应商与模型、图定义、知识库、最近执行的概览与入口。
 */
const loading = ref(false)
const error = ref('')
const providerCount = ref(0)
const modelCount = ref(0)
const graphCount = ref(0)
const knowledgeCount = ref(0)
const recentExecutions = ref<AgentGraphExecution[]>([])

const overviewCards = computed(() => [
  {
    key: 'models',
    title: t('agent.overviewProvidersModels'),
    value: t('agent.providerModelCount', {
      providers: providerCount.value,
      models: modelCount.value,
    }),
    to: '/agent/model',
  },
  {
    key: 'graphs',
    title: t('agent.overviewGraphs'),
    value: t('agent.graphCount', { count: graphCount.value }),
    to: '/agent/graph-def',
  },
  {
    key: 'knowledge',
    title: t('agent.overviewKnowledge'),
    value: t('agent.knowledgeCount', { count: knowledgeCount.value }),
    to: '/agent/knowledge',
  },
  {
    key: 'executions',
    title: t('agent.overviewRecentExecutions'),
    value: t('agent.recentExecutionCount', { count: recentExecutions.value.length }),
    to: '/agent/executions/list',
  },
])

const entries = computed(() => [
  { key: 'model', title: t('agent.modelManagement'), to: '/agent/model' },
  { key: 'graph', title: t('agent.graphDefManagement'), to: '/agent/graph-def' },
  { key: 'tool', title: t('router.toolManagement'), to: '/agent/tool' },
  { key: 'executions', title: t('agent.executionHistory'), to: '/agent/executions/list' },
  { key: 'conversations', title: t('agent.conversationHistory'), to: '/agent/conversations/list' },
  { key: 'knowledge', title: t('agent.overviewKnowledge'), to: '/agent/knowledge' },
])

const STATUS_MAP: Record<string, { label: string; type: 'success' | 'warning' | 'danger' }> = {
  RUNNING: {
    get label() {
      return t('common.statusRunning')
    },
    type: 'warning',
  },
  SUCCESS: {
    get label() {
      return t('common.resultSuccess')
    },
    type: 'success',
  },
  FAILED: {
    get label() {
      return t('common.resultFailed')
    },
    type: 'danger',
  },
}

function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function statusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  return STATUS_MAP[status]?.type ?? 'info'
}

function formatTime(value?: string): string {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

function open(path: string) {
  void router.push(path)
}

function openExecution(row: AgentGraphExecution) {
  void router.push(`/agent/executions/detail/${row.id}`)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [providers, models, graphs, knowledgeBases, executions] = await Promise.all([
      pageProviders({ pageNum: 1, pageSize: 1 }),
      pageModels({ pageNum: 1, pageSize: 1 }),
      pageGraphDefs({ pageNum: 1, pageSize: 1 }),
      pageKnowledgeBases({ pageNum: 1, pageSize: 1 }),
      pageGraphExecutionsWithVersion({ pageNum: 1, pageSize: 5 }),
    ])
    providerCount.value = providers.total
    modelCount.value = models.total
    graphCount.value = graphs.total
    knowledgeCount.value = knowledgeBases.total
    recentExecutions.value = executions.list
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('agent.workspaceLoadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div v-loading="loading" class="agent-home">
    <header class="agent-home__header">
      <div>
        <h2 class="agent-home__title">{{ t('agent.workspaceTitle') }}</h2>
        <p class="agent-home__subtitle">{{ t('agent.workspaceSubtitle') }}</p>
      </div>
      <el-button @click="load">{{ t('common.refresh') }}</el-button>
    </header>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />

    <div class="agent-home__cards">
      <el-card
        v-for="card in overviewCards"
        :key="card.key"
        shadow="hover"
        class="overview-card"
        @click="open(card.to)"
      >
        <div class="overview-card__title">{{ card.title }}</div>
        <div class="overview-card__value">{{ card.value }}</div>
      </el-card>
    </div>

    <div class="agent-home__entries">
      <div class="section-title">{{ t('agent.quickEntries') }}</div>
      <div class="entry-list">
        <el-button
          v-for="entry in entries"
          :key="entry.key"
          type="primary"
          plain
          @click="open(entry.to)"
        >
          {{ entry.title }}
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="agent-home__recent">
      <template #header>
        <div class="section-title">{{ t('agent.overviewRecentExecutions') }}</div>
      </template>
      <el-table :data="recentExecutions" size="small" @row-click="openExecution">
        <el-table-column :label="t('agent.executionId')" width="180">
          <template #default="{ row }">#{{ (row as AgentGraphExecution).id }}</template>
        </el-table-column>
        <el-table-column :label="t('agent.graphName')" min-width="160">
          <template #default="{ row }">
            {{
              (row as AgentGraphExecution).graphName ||
              `#${(row as AgentGraphExecution).graphDefId}`
            }}
          </template>
        </el-table-column>
        <el-table-column :label="t('agent.snapshotVersionColumn')" width="120">
          <template #default="{ row }">v{{ (row as AgentGraphExecution).defVersion }}</template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType((row as AgentGraphExecution).status)" size="small">
              {{ statusLabel((row as AgentGraphExecution).status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.createTime')" width="180">
          <template #default="{ row }">{{
            formatTime((row as AgentGraphExecution).createTime)
          }}</template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && recentExecutions.length === 0"
        :description="t('agent.recentExecutionsEmpty')"
      />
    </el-card>
  </div>
</template>

<style scoped>
.agent-home {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.agent-home__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-home__title {
  margin: 0;
  font-size: 22px;
}

.agent-home__subtitle {
  margin: 6px 0 0;
  color: var(--sw-text-secondary);
}

.agent-home__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.overview-card {
  cursor: pointer;
}

.overview-card__title {
  color: var(--sw-text-secondary);
  font-size: 13px;
  margin-bottom: 8px;
}

.overview-card__value {
  font-size: 18px;
  font-weight: 600;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.entry-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.agent-home__recent :deep(.el-table__row) {
  cursor: pointer;
}
</style>
