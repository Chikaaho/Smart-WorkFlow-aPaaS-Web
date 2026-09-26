<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * WorkflowCenter — 统一工作台（I4 §3.7）。
 * 单页聚合：待办 / 已办 / 我发起的 / 草稿 / 抄送 / 消息入口；
 * 各列表均使用服务端当前身份数据，取消未办理不进已办（服务端口径）；
 * 深链进入详情后仍走对象权限。与 P54 个性化工作台并存，不替换其布局数据。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ListActionsColumn, ListPagination } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { queryTodoTasks, queryProcessedTasks, myInstances, myDrafts } from '@/modules/workflow/api'
import { queryMyCopies } from '@/modules/workflow/api/oa'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

type TabKey = 'todo' | 'processed' | 'initiated' | 'drafts' | 'cc' | 'messages'

const router = useRouter()
const activeTab = ref<TabKey>('todo')
const loading = ref(false)
const errorMsg = ref('')

interface Row {
  id?: string | number
  taskId?: string
  processInstanceId?: string
  name?: string
  processDefinitionKey?: string
  status?: string
  createTime?: string
  title?: string
}

const lists = ref<Record<'todo' | 'processed' | 'initiated' | 'drafts' | 'cc', Row[]>>({
  todo: [],
  processed: [],
  initiated: [],
  drafts: [],
  cc: [],
})

const TAB_TITLES: Record<TabKey, string> = {
  get todo() {
    return t('workflow.todoTab')
  },
  get processed() {
    return t('workflow.processedTab')
  },
  get initiated() {
    return t('common.startedByMe')
  },
  get drafts() {
    return t('common.statusDraft')
  },
  get cc() {
    return t('workflow.cc')
  },
  get messages() {
    return t('common.message')
  },
}

const currentRows = computed(() =>
  activeTab.value === 'messages' ? [] : lists.value[activeTab.value],
)

async function loadTab(tab: TabKey) {
  if (tab === 'messages') return // 消息为跳转入口，不加载列表
  loading.value = true
  errorMsg.value = ''
  const page: PageQuery = { pageNum: 1, pageSize: 20 }
  try {
    if (tab === 'todo') {
      lists.value.todo = (await queryTodoTasks(page)).list as unknown as Row[]
    } else if (tab === 'processed') {
      lists.value.processed = (await queryProcessedTasks(page)).list as unknown as Row[]
    } else if (tab === 'initiated') {
      const result = await myInstances(page)
      lists.value.initiated = result.list as unknown as Row[]
    } else if (tab === 'drafts') {
      lists.value.drafts = (await myDrafts(page)).list as unknown as Row[]
    } else if (tab === 'cc') {
      const result = await queryMyCopies(page)
      lists.value.cc = result.list as unknown as Row[]
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.listLoadFailed')
  } finally {
    loading.value = false
  }
}

function rowId(row: Row): string {
  return String(row.taskId ?? row.processInstanceId ?? row.id ?? '')
}

function openRow(row: Row) {
  // 深链：待办/已办 → 任务办理（对象权限由服务端二次校验）；草稿 → 表单渲染草稿模式
  if (row.taskId) {
    // 已办页签携带 source=processed，详情页按已办只读渲染并回跳（V012-BUG-001）
    const query = activeTab.value === 'processed' ? { source: 'processed' } : undefined
    void router.push({ path: `/workflow/task/${row.taskId}`, query })
  } else if (activeTab.value === 'drafts' && row.id) {
    const formKey = (row as Record<string, string>).formKey ?? ''
    void router.push(`/form/form-render/${formKey}?draftId=${row.id}&mode=draft`)
  }
}

/**
 * 操作列（V012-BUG-002）：单按钮「详情」，行为与行点击 openRow 一致。
 * 仅存在可打开对象（待办/已办的 taskId、草稿 id）的行可见，与原 v-if 口径一致。
 */
function rowActions(row: unknown, tab: TabKey): ListAction[] {
  const item = row as Row
  return [
    {
      key: 'detail',
      label: t('common.detail'),
      visible: Boolean(item.taskId) || (tab === 'drafts' && Boolean(item.id)),
      onClick: () => openRow(item),
    },
  ]
}

// ─── 客户端分页（V012-BUG-003）：各页签一次拉取全量（服务端 pageSize 20），前端切片 ───
const pageNum = ref(1)
const pageSize = ref(20)

const pagedRows = computed(() =>
  currentRows.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value),
)

function handlePageNumChange(p: number) {
  pageNum.value = p
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
}

function handleTabChange(tab: string | number) {
  pageNum.value = 1
  void loadTab(tab as TabKey)
}

onMounted(() => void loadTab('todo'))
</script>

<template>
  <div class="workflow-center">
    <h2 class="page-title">{{ t('common.workspace') }}</h2>
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane v-for="(title, key) in TAB_TITLES" :key="key" :label="title" :name="key">
        <template v-if="(key as TabKey) !== 'messages'">
          <el-alert
            v-if="errorMsg && activeTab === key"
            :title="errorMsg"
            type="error"
            :closable="false"
          />
          <el-table v-loading="loading && activeTab === key" :data="pagedRows" size="default">
            <el-table-column :label="t('workflow.titleOrItemColumn')" min-width="200">
              <template #default="{ row }">{{
                row.name || row.title || row.processDefinitionKey || '—'
              }}</template>
            </el-table-column>
            <el-table-column :label="t('common.identifier')" min-width="180">
              <template #default="{ row }">{{ rowId(row) }}</template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="110">
              <template #default="{ row }">{{ row.status || '—' }}</template>
            </el-table-column>
            <el-table-column :label="t('common.time')" min-width="160">
              <template #default="{ row }">{{ row.createTime || '—' }}</template>
            </el-table-column>
            <ListActionsColumn
              :actions="(row: unknown) => rowActions(row, key as TabKey)"
              :width="90"
            />
            <template #empty>{{ t('common.emptyData') }}</template>
          </el-table>
          <ListPagination
            :total="currentRows.length"
            :page-num="pageNum"
            :page-size="pageSize"
            @update:page-num="handlePageNumChange"
            @update:page-size="handlePageSizeChange"
          />
        </template>
        <template v-else>
          <el-empty :description="t('workflow.inboxEntry')">
            <el-button type="primary" @click="router.push('/notify/record')">{{
              t('workflow.openMessageRecords')
            }}</el-button>
          </el-empty>
        </template>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.workflow-center {
  padding: 16px 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--sw-text-primary, #303133);
  margin: 0 0 8px;
}
</style>
