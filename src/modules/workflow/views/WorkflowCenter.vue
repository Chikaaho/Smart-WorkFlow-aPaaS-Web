<script setup lang="ts">
/**
 * WorkflowCenter — 统一工作台（I4 §3.7）。
 * 单页聚合：待办 / 已办 / 我发起的 / 草稿 / 抄送 / 消息入口；
 * 各列表均使用服务端当前身份数据，取消未办理不进已办（服务端口径）；
 * 深链进入详情后仍走对象权限。与 P54 个性化工作台并存，不替换其布局数据。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
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
  todo: '待办',
  processed: '已办',
  initiated: '我发起的',
  drafts: '草稿',
  cc: '抄送',
  messages: '消息',
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
    errorMsg.value = err instanceof ApiError ? err.msg : '列表加载失败'
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
    void router.push(`/workflow/task/${row.taskId}`)
  } else if (activeTab.value === 'drafts' && row.id) {
    const formKey = (row as Record<string, string>).formKey ?? ''
    void router.push(`/form/form-render/${formKey}?draftId=${row.id}&mode=draft`)
  }
}

function handleTabChange(tab: string | number) {
  void loadTab(tab as TabKey)
}

onMounted(() => void loadTab('todo'))
</script>

<template>
  <div class="workflow-center">
    <h2 class="page-title">工作台</h2>
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane v-for="(title, key) in TAB_TITLES" :key="key" :label="title" :name="key">
        <template v-if="(key as TabKey) !== 'messages'">
          <el-alert
            v-if="errorMsg && activeTab === key"
            :title="errorMsg"
            type="error"
            :closable="false"
          />
          <el-table v-loading="loading && activeTab === key" :data="currentRows" size="default">
            <el-table-column label="标题/事项" min-width="200">
              <template #default="{ row }">{{
                row.name || row.title || row.processDefinitionKey || '—'
              }}</template>
            </el-table-column>
            <el-table-column label="标识" min-width="180">
              <template #default="{ row }">{{ rowId(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">{{ row.status || '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" min-width="160">
              <template #default="{ row }">{{ row.createTime || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button
                  v-if="
                    (key as TabKey) !== 'messages' &&
                    (row.taskId || ((key as TabKey) === 'drafts' && row.id))
                  "
                  link
                  type="primary"
                  @click="openRow(row)"
                >
                  打开
                </el-button>
              </template>
            </el-table-column>
            <template #empty>暂无数据</template>
          </el-table>
        </template>
        <template v-else>
          <el-empty description="站内信入口">
            <el-button type="primary" @click="router.push('/notify/record')"
              >打开消息记录</el-button
            >
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
