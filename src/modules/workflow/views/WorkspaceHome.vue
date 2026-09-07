<script setup lang="ts">
/**
 * WorkspaceHome — 工作台（v0.0.2 P54，三类身份默认首页）。
 *
 * 首批四组件：待办、我发起的、抄送、常用事项；支持显示/隐藏、顺序调整、
 * 常用事项选择，按当前租户及用户持久化，可恢复默认。
 * 隐藏组件不查询数据；失效事项（不可见/未发布/无绑定）不成为可执行入口；
 * 组件数据查询失败（含撤权）以空态收敛，不阻塞整页。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Setting, Star } from '@element-plus/icons-vue'
import {
  getWorkspaceLayout,
  saveWorkspaceLayout,
  resetWorkspaceLayout,
  queryCatalogItems,
  queryMyCopies,
  type CatalogItem,
} from '@/modules/workflow/api/oa'
import { queryTodoTasks, myInstances } from '@/modules/workflow/api'
import type { WorkspaceComponent, WorkspaceComponentKey } from '@/contracts/catalog'
import { ApiError } from '@/foundation/request'

const router = useRouter()

// ─── 布局状态 ───
const components = ref<WorkspaceComponent[]>([])
const favoriteKeys = ref<string[]>([])
const custom = ref(false)
const loading = ref(false)
const configVisible = ref(false)
const dirty = ref(false)

// ─── 组件数据 ───
const todoList = ref<Array<Record<string, unknown>>>([])
const initiatedList = ref<Array<Record<string, unknown>>>([])
const ccList = ref<Array<Record<string, unknown>>>([])
const favoriteItems = ref<CatalogItem[]>([])

const COMPONENT_TITLES: Record<WorkspaceComponentKey, string> = {
  todo: '我的待办',
  myInitiated: '我发起的',
  cc: '抄送',
  favoriteItems: '常用事项',
}

const orderedVisible = computed(() =>
  components.value
    .filter((c) => c.visible)
    .slice()
    .sort((a, b) => a.order - b.order),
)

async function loadLayout() {
  loading.value = true
  try {
    const resp = await getWorkspaceLayout()
    custom.value = resp.custom
    components.value = resp.layout.components
    favoriteKeys.value = resp.layout.favoriteItemKeys
    await Promise.all([loadComponentData(), loadFavorites()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '加载工作台失败')
  } finally {
    loading.value = false
  }
}

async function loadComponentData() {
  const tasks: Array<Promise<void>> = []
  const visible = (key: WorkspaceComponentKey) =>
    components.value.some((c) => c.key === key && c.visible)
  if (visible('todo')) {
    tasks.push(
      queryTodoTasks({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          todoList.value = page.list as unknown as Array<Record<string, unknown>>
        })
        .catch(() => {
          todoList.value = []
        }),
    )
  }
  if (visible('myInitiated')) {
    tasks.push(
      myInstances({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          initiatedList.value = page.list as unknown as Array<Record<string, unknown>>
        })
        .catch(() => {
          initiatedList.value = []
        }),
    )
  }
  if (visible('cc')) {
    tasks.push(
      queryMyCopies({ pageNum: 1, pageSize: 5 })
        .then((page) => {
          ccList.value = page.list as unknown as Array<Record<string, unknown>>
        })
        .catch(() => {
          ccList.value = []
        }),
    )
  }
  await Promise.all(tasks)
}

/** 常用事项仅以当前可见目录解析：失效事项不渲染为入口。 */
async function loadFavorites() {
  if (!components.value.some((c) => c.key === 'favoriteItems' && c.visible)) {
    favoriteItems.value = []
    return
  }
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    const keys = new Set(favoriteKeys.value)
    favoriteItems.value = page.list.filter((item) => keys.has(item.itemKey))
  } catch {
    favoriteItems.value = []
  }
}

function openForm(formKey: string) {
  void router.push(`/form/form-render/${formKey}`)
}

// ─── 配置模式 ───
const catalogChoices = ref<CatalogItem[]>([])

async function openConfig() {
  configVisible.value = true
  try {
    const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
    catalogChoices.value = page.list
  } catch {
    catalogChoices.value = []
  }
}
function toggleVisible(component: WorkspaceComponent) {
  component.visible = !component.visible
  dirty.value = true
}

function move(component: WorkspaceComponent, delta: -1 | 1) {
  const sorted = components.value.slice().sort((a, b) => a.order - b.order)
  const index = sorted.indexOf(component)
  const target = index + delta
  if (target < 0 || target >= sorted.length) return
  const other = sorted[target]
  const tmp = component.order
  component.order = other.order
  other.order = tmp
  dirty.value = true
}

/** 布局宽度调整：半宽（1）↔ 整行（2），随布局持久化。 */
function toggleSpan(component: WorkspaceComponent) {
  component.span = component.span === 2 ? 1 : 2
  dirty.value = true
}

function toggleFavorite(key: string) {
  const index = favoriteKeys.value.indexOf(key)
  if (index >= 0) {
    favoriteKeys.value.splice(index, 1)
  } else if (favoriteKeys.value.length < 20) {
    favoriteKeys.value.push(key)
  } else {
    ElMessage.warning('常用事项不能超过 20 个')
    return
  }
  dirty.value = true
}

async function saveConfig() {
  try {
    await saveWorkspaceLayout({
      components: components.value.map((c) => ({ ...c })),
      favoriteItemKeys: [...favoriteKeys.value],
    })
    custom.value = true
    dirty.value = false
    configVisible.value = false
    ElMessage.success('工作台配置已保存')
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '保存配置失败')
  }
}

async function resetConfig() {
  try {
    await resetWorkspaceLayout()
    ElMessage.success('已恢复默认布局')
    dirty.value = false
    configVisible.value = false
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '恢复默认失败')
  }
}

onMounted(loadLayout)
</script>

<template>
  <div v-loading="loading" class="workspace">
    <header class="workspace__header">
      <h2 class="workspace__title">工作台</h2>
      <el-button :icon="Setting" text @click="openConfig">配置</el-button>
    </header>

    <div class="workspace__grid">
      <section
        v-for="component in orderedVisible"
        :key="component.key"
        class="workspace-card"
        :class="{ 'workspace-card--wide': component.span === 2 }"
      >
        <h3 class="workspace-card__title">{{ COMPONENT_TITLES[component.key] }}</h3>

        <template v-if="component.key === 'todo'">
          <p v-if="todoList.length === 0" class="workspace-card__empty">暂无待办任务</p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in todoList" :key="index" class="workspace-card__row">
              <span>{{ (item.name as string) ?? (item.taskId as string) ?? '-' }}</span>
              <el-button
                size="small"
                link
                type="primary"
                @click="router.push(`/workflow/task/${item.taskId as string}`)"
              >
                办理
              </el-button>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'myInitiated'">
          <p v-if="initiatedList.length === 0" class="workspace-card__empty">暂无发起的流程</p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in initiatedList" :key="index" class="workspace-card__row">
              <span>{{ (item.processDefKey as string) ?? '-' }}</span>
              <el-tag size="small" type="info">{{ (item.status as string) ?? '-' }}</el-tag>
            </li>
          </ul>
        </template>

        <template v-else-if="component.key === 'cc'">
          <p v-if="ccList.length === 0" class="workspace-card__empty">暂无抄送</p>
          <ul v-else class="workspace-card__list">
            <li v-for="(item, index) in ccList" :key="index" class="workspace-card__row">
              <span>{{ (item.formKey as string) ?? '-' }}</span>
              <span class="workspace-card__time">{{ (item.createTime as string) ?? '' }}</span>
            </li>
          </ul>
        </template>

        <template v-else>
          <p v-if="favoriteItems.length === 0" class="workspace-card__empty">
            暂无常用事项，可在「配置」中从流程中心选择
          </p>
          <div v-else class="workspace-card__favorites">
            <button
              v-for="item in favoriteItems"
              :key="item.itemKey"
              class="favorite-item"
              type="button"
              @click="openForm(item.formKey)"
            >
              <el-icon :size="14"><Star /></el-icon>
              <span>{{ item.name }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <!-- 配置抽屉 -->
    <el-drawer v-model="configVisible" title="工作台配置" size="420px">
      <h4 class="config-section">组件显隐与顺序</h4>
      <ul class="config-list">
        <li
          v-for="component in components.slice().sort((a, b) => a.order - b.order)"
          :key="component.key"
          class="config-list__row"
        >
          <el-switch v-model="component.visible" @change="toggleVisible(component)" />
          <span class="config-list__name">{{ COMPONENT_TITLES[component.key] }}</span>
          <el-button size="small" @click="toggleSpan(component)">
            {{ component.span === 2 ? '半宽' : '整行' }}
          </el-button>
          <el-button size="small" :disabled="component.order <= 1" @click="move(component, -1)"
            >上移</el-button
          >
          <el-button
            size="small"
            :disabled="component.order >= components.length"
            @click="move(component, 1)"
            >下移</el-button
          >
        </li>
      </ul>

      <h4 class="config-section">常用事项（从本人可发起事项中选择）</h4>
      <ul class="config-favorites">
        <li v-for="item in catalogChoices" :key="item.itemKey" class="config-list__row">
          <el-checkbox
            :model-value="favoriteKeys.includes(item.itemKey)"
            @change="toggleFavorite(item.itemKey)"
          >
            {{ item.name }}
          </el-checkbox>
        </li>
      </ul>

      <template #footer>
        <el-button @click="resetConfig">恢复默认</el-button>
        <el-button type="primary" :disabled="!dirty" @click="saveConfig">保存配置</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.workspace {
  max-width: 1100px;
  margin: 0 auto;
}
.workspace__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.workspace__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.workspace__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.workspace-card {
  padding: 16px 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  box-shadow: var(--sw-shadow-card, 0 1px 8px rgba(0, 0, 0, 0.04));
}
.workspace-card--wide {
  grid-column: 1 / -1;
}
.workspace-card__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-color-primary, #7e306b);
}
.workspace-card__empty {
  margin: 0;
  font-size: 13px;
  color: var(--sw-color-text-secondary, #909399);
}
.workspace-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.workspace-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}
.workspace-card__row:last-child {
  border-bottom: none;
}
.workspace-card__time {
  font-size: 12px;
  color: var(--sw-color-text-secondary, #909399);
}
.workspace-card__favorites {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.favorite-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--sw-color-primary, #7e306b);
  background: var(--sw-color-primary-light-5, #f2eaf0);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.config-section {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary, #7e306b);
}
.config-list,
.config-favorites {
  margin: 0;
  padding: 0;
  list-style: none;
}
.config-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.config-list__name {
  flex: 1;
}
</style>
