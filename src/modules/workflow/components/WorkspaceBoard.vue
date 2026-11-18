<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * WorkspaceBoard — 工作台画布（v0.0.2 P54 首页 + v0.1.1 BUG-002 低代码编辑）。
 *
 * 设计信息架构：欢迎区 + 四统计卡 + 我的待办面板 + 快捷发起 + 业务动态 + 流程效能。
 * 数据全部来自真实接口：统计=各分页 total；待办/已办/发起/抄送=真实列表；
 * 快捷发起=常用事项；流程效能=/workflow/monitor/analytics/summary（无权限/失败时
 * 以「—」空值收敛，不伪造指标）。徽标/临期计数等设计密度字段仅当接口返回时渲染。
 * 隐藏组件不查询数据；组件配置（显示/顺序/常用事项）经既有布局契约持久化。
 * editable=false（/workspace 首页）只读渲染；editable=true（/workspace/edit 顶层独立
 * 编辑页）所见即所得：真实卡片 + 编辑 chrome（拖拽/缩放/对齐线），保存后主页一致。
 *
 * 结构：布局加载/保存编排与画布宿主保留在本文件；
 * 状态与派生逻辑在 use-workspace-* 组合式函数，外壳与卡片面板在 WorkspaceBoard* 子组件。
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getWorkspaceLayout,
  saveWorkspaceLayout,
  resetWorkspaceLayout,
} from '@/modules/workflow/api/oa'
import { ApiError } from '@/foundation/request'
import { toRelativeRect } from '@/modules/workflow/utils/workspace-canvas'
import WorkspaceDataCard from './WorkspaceDataCard.vue'
import WorkspaceBoardSidebar from './WorkspaceBoardSidebar.vue'
import WorkspaceBoardHero from './WorkspaceBoardHero.vue'
import WorkspaceBoardToolbar from './WorkspaceBoardToolbar.vue'
import WorkspaceBoardPalette from './WorkspaceBoardPalette.vue'
import WorkspaceBoardCanvasCard from './WorkspaceBoardCanvasCard.vue'
import WorkspaceBoardStatsPanel from './WorkspaceBoardStatsPanel.vue'
import WorkspaceBoardTodoPanel from './WorkspaceBoardTodoPanel.vue'
import WorkspaceBoardFavoritesPanel from './WorkspaceBoardFavoritesPanel.vue'
import WorkspaceBoardActivityPanel from './WorkspaceBoardActivityPanel.vue'
import WorkspaceBoardEfficiencyPanel from './WorkspaceBoardEfficiencyPanel.vue'
import { useWorkspaceConfig } from './use-workspace-config'
import { useWorkspaceData } from './use-workspace-data'
import { useWorkspaceAnalytics } from './use-workspace-analytics'
import { useWorkspacePanel } from './use-workspace-panel'
import { useWorkspaceCanvas } from './use-workspace-canvas'

const router = useRouter()

// ─── 布局状态 ───
const props = defineProps<{ editable?: boolean; embedded?: boolean; configViaDialog?: boolean }>()
const emit = defineEmits<{ configure: [] }>()
const dirty = ref(false)

/** 编辑页传 editable；首页只读。embedded=嵌入配置弹窗（工具栏按钮归弹窗页脚）。 */
const editing = computed(() => props.editable === true)
const paletteVisible = ref(props.editable === true)

// ─── 设计01 批次2：左侧深色工作台侧栏（可折起为窄轨） ───
const sidebarCollapsed = ref(false)

/* ── 布局配置核心：组件清单/卡片类型/常用事项 + 渲染器与标题解析 ── */
const {
  components,
  cardTypes,
  favoriteKeys,
  custom,
  loading,
  catalogChoices,
  loadCatalogChoices,
  defaultMetadata,
  applyLayoutResponse,
  setVisible,
  toggleFavorite,
  isComponentIncluded,
  componentTitle,
  rendererKeyOf,
  dataConfigOf,
  dataKindOf,
  showTodoPanel,
  showStats,
  showActivity,
} = useWorkspaceConfig({ dirty })

/* ── 自由画布几何与拖拽会话 ── */
const {
  setCanvasRef,
  geometryMap,
  guides,
  draggingPayload,
  dragState,
  selectedKey,
  canvasItems,
  canvasHeight,
  currentCanvasWidth,
  hydrateGeometry,
  ensureGeometry,
  itemStyle,
  startPaletteDrag,
  addComponent,
  dropPaletteCard,
  startCardDrag,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
} = useWorkspaceCanvas({
  components,
  cardTypes,
  editing,
  dirty,
  rendererKeyOf,
  defaultMetadata,
})

/* ── 组件真实数据（统计/待办/已办/发起/抄送/草稿/常用事项） ── */
const {
  todoList,
  processedList,
  initiatedList,
  ccList,
  draftsList,
  todoTotal,
  processedTotal,
  draftsTotal,
  ccTotal,
  todoExtra,
  stats,
  STAT_ICONS,
  statMetricOf,
  quickActions,
  loadComponentData,
  loadFavorites,
} = useWorkspaceData({
  components,
  favoriteKeys,
  rendererKeyOf,
  showTodoPanel,
  showStats,
  showActivity,
})

/* ── 流程效能（真实分析摘要） ── */
const { avgDurationText, completionPct, effBoxes, loadAnalytics } = useWorkspaceAnalytics({
  processedTotal,
  todoExtra,
})

/* ── 待办面板/业务动态派生与行跳转 ── */
const {
  activeTodoTab,
  panelTabs,
  panelRows,
  rowTitle,
  rowMeta,
  dueChip,
  isOverdue,
  openPanelTask,
  activityFilter,
  activityRows,
  activityChips,
  openForm,
  openDraft,
} = useWorkspacePanel({
  components,
  rendererKeyOf,
  todoList,
  processedList,
  initiatedList,
  ccList,
  draftsList,
  todoTotal,
  processedTotal,
  ccTotal,
  draftsTotal,
  router,
})

async function loadLayout() {
  loading.value = true
  try {
    const resp = await getWorkspaceLayout()
    applyLayoutResponse(resp)
    hydrateGeometry()
    await Promise.all([loadComponentData(), loadFavorites(), loadAnalytics()])
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceLoadFailed'))
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  const canvasW = currentCanvasWidth()
  try {
    await saveWorkspaceLayout({
      cards: components.value.map((c) => {
        const rect = geometryMap.value[c.key]
        const relative = rect ? toRelativeRect(rect, canvasW) : null
        if (relative) {
          // 持久化契约要求 x/w 落在 0..1；跨编辑/只读画布宽度保存时也不越界。
          relative.x = Math.min(relative.x, Math.max(0, 1 - relative.w))
        }
        return {
          typeCode: c.key,
          visible: c.visible,
          order: c.order,
          span: c.span === 2 ? 2 : 1,
          metadata: {
            ...(c.metadata ?? {}),
            ...(relative ? { geometry: relative } : {}),
          },
        }
      }),
      favoriteItemKeys: [...favoriteKeys.value],
    })
    custom.value = true
    dirty.value = false
    ElMessage.success(t('workflow.workspaceSaved'))
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.workspaceSaveFailed'))
  }
}

async function resetConfig() {
  try {
    await resetWorkspaceLayout()
    ElMessage.success(t('workflow.layoutRestored'))
    dirty.value = false
    selectedKey.value = null
    await loadLayout()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.layoutRestoreFailed'))
  }
}

/** 配置弹窗页脚复用同一保存/恢复语义；dirty 只在成功保存后归零。 */
defineExpose({ saveConfig, resetConfig, dirty })

/** 小齿轮：编辑态切换组件库面板；首页进入全屏配置（旧弹窗入口保留兼容）。 */
function onGearClick() {
  if (editing.value) {
    paletteVisible.value = !paletteVisible.value
    return
  }
  if (props.configViaDialog) {
    emit('configure')
    return
  }
  void router.push('/workspace/config')
}

onMounted(async () => {
  await loadLayout()
  await nextTick()
  ensureGeometry()
  if (props.editable) void loadCatalogChoices()
})
</script>

<template>
  <div
    v-loading="loading"
    class="wsd"
    :class="{
      'is-editing': editing,
      'has-sidebar': !editing && !sidebarCollapsed,
      'has-sidebar-rail': !editing && sidebarCollapsed,
    }"
  >
    <!-- 设计01 批次2（B021-007）：左侧深色工作台侧栏，可折起为窄轨；仅查看态。 -->
    <WorkspaceBoardSidebar v-if="!editing" v-model:collapsed="sidebarCollapsed" />
    <!-- 设计01 工作台（B021-007 功能遗漏回补）：查看态头部为问候行+今日统计+右上配置入口；
         顶层页不提供返回（B021-001）。 -->
    <WorkspaceBoardHero
      v-if="!editing"
      :todo-total="todoTotal"
      :todo-extra="todoExtra"
      @configure="onGearClick"
    />

    <WorkspaceBoardToolbar
      v-if="editing"
      :custom="custom"
      :embedded="embedded"
      :dirty="dirty"
      @save="saveConfig"
      @reset="resetConfig"
    />

    <div class="wsd-canvas-wrap">
      <WorkspaceBoardPalette
        v-if="editing && paletteVisible"
        :card-types="cardTypes"
        :catalog-choices="catalogChoices"
        :favorite-keys="favoriteKeys"
        :is-component-included="isComponentIncluded"
        :start-palette-drag="startPaletteDrag"
        :add-component="addComponent"
        :toggle-favorite="toggleFavorite"
        @drag-end="draggingPayload = ''"
      />

      <div
        :ref="setCanvasRef"
        class="wsd-canvas"
        :class="{ 'is-editing': editing }"
        :style="{ height: canvasHeight + 'px' }"
        @dragover.prevent
        @drop="dropPaletteCard($event)"
        @pointerdown="onCanvasPointerDown"
        @pointermove="onCanvasPointerMove"
        @pointerup="onCanvasPointerUp"
        @pointercancel="onCanvasPointerUp"
      >
        <template v-if="editing">
          <div
            v-for="(x, index) in guides.v"
            :key="`v${index}`"
            class="wsd-guide wsd-guide--v"
            :style="{ left: x + 'px' }"
          />
          <div
            v-for="(y, index) in guides.h"
            :key="`h${index}`"
            class="wsd-guide wsd-guide--h"
            :style="{ top: y + 'px' }"
          />
        </template>
        <div v-if="canvasItems.length === 0" class="wsd-canvas__empty">
          {{ t('workspace.dropComponentHere') }}
        </div>

        <WorkspaceBoardCanvasCard
          v-for="component in canvasItems"
          :key="component.key"
          :component="component"
          :title="componentTitle(component.key)"
          :renderer="rendererKeyOf(component.key)"
          :editing="editing"
          :selected="selectedKey === component.key"
          :dragging="dragState?.key === component.key"
          :resizing="dragState?.key === component.key && dragState?.mode === 'resize'"
          :resize-handle="dragState?.handle ?? ''"
          :style="itemStyle(component.key)"
          @move-drag="startCardDrag($event, component.key, 'move')"
          @resize-drag="(event, handle) => startCardDrag(event, component.key, 'resize', handle)"
          @toggle-visible="setVisible(component, !component.visible)"
        >
          <!-- B021-007 批次5：独立指标卡（statTodo/statInitiated/statProcessed/statDrafts） -->
          <WorkspaceBoardStatsPanel
            v-if="statMetricOf(component.key)"
            :metric="statMetricOf(component.key)"
            :stat-icons="STAT_ICONS"
          />
          <WorkspaceBoardStatsPanel
            v-else-if="rendererKeyOf(component.key) === 'stats'"
            :rows="stats"
            :stat-icons="STAT_ICONS"
          />

          <WorkspaceBoardTodoPanel
            v-else-if="rendererKeyOf(component.key) === 'todo'"
            :tabs="panelTabs"
            :active-tab="activeTodoTab"
            :rows="panelRows"
            :row-title="rowTitle"
            :row-meta="rowMeta"
            :due-chip="dueChip"
            :is-overdue="isOverdue"
            :open-panel-task="openPanelTask"
            @select-tab="activeTodoTab = $event"
          />

          <WorkspaceBoardFavoritesPanel
            v-else-if="rendererKeyOf(component.key) === 'favorites'"
            :quick-actions="quickActions"
            :gear-click="onGearClick"
            :open-form="openForm"
          />

          <WorkspaceBoardActivityPanel
            v-else-if="rendererKeyOf(component.key) === 'activity'"
            :rows="activityRows"
            :chips="activityChips"
            :filter="activityFilter"
            @select-filter="activityFilter = $event"
          />

          <WorkspaceBoardEfficiencyPanel
            v-else-if="rendererKeyOf(component.key) === 'efficiency'"
            :avg-duration-text="avgDurationText"
            :completion-pct="completionPct"
            :eff-boxes="effBoxes"
          />

          <section v-else-if="rendererKeyOf(component.key) === 'drafts'" class="wsd-panel">
            <div class="wsd-panel__head">
              <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
            </div>
            <p v-if="draftsList.length === 0" class="wsd-panel__empty">
              {{ t('workflow.noDrafts') }}
            </p>
            <ul v-else class="wsd-actrows">
              <li v-for="(item, index) in draftsList" :key="index" class="wsd-act">
                <div class="wsd-act__main">
                  <span class="wsd-act__title">{{ (item.formKey as string) ?? '-' }}</span>
                </div>
                <button class="wsd-btn" type="button" @click="openDraft(item)">
                  {{ t('workflow.continueEditing') }}
                </button>
              </li>
            </ul>
          </section>

          <section v-else-if="rendererKeyOf(component.key) === 'messages'" class="wsd-panel">
            <div class="wsd-panel__head">
              <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
            </div>
            <p class="wsd-panel__empty">{{ t('workflow.messagesEntryHint') }}</p>
            <button class="wsd-btn" type="button" @click="router.push('/notify/record')">
              {{ t('workflow.openMessages') }}
            </button>
          </section>

          <section v-else-if="dataKindOf(component)" class="wsd-panel wsd-panel--data">
            <div class="wsd-panel__head">
              <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
            </div>
            <WorkspaceDataCard
              :kind="dataKindOf(component) ?? 'metric'"
              :config="dataConfigOf(component)"
            />
          </section>

          <section v-else class="wsd-panel">
            <div class="wsd-panel__head">
              <h3 class="wsd-panel__title">{{ componentTitle(component.key) }}</h3>
            </div>
            <p class="wsd-panel__empty">{{ t('workspace.basicComponent') }}</p>
          </section>
        </WorkspaceBoardCanvasCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* BUG-003：工作台随视口全宽呈现（移除 P53 的 1216px 定宽上限），卡片几何按
   画布宽度分数自适应分辨率；窄屏压缩留白保持可读（≤767px 侧栏由壳层隐藏）。
   Owner 2026-09-22 补充：工作台不允许左右滑动——横向溢出在此硬性收口，
   仅组件较多时允许画布纵向滚动。 */
.wsd {
  --sw-border: #e1e5ef;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  /* B021-014：随 workspace-home（已铺满可视区）的生长空间撑满；空内容时
     v-loading 遮罩才能盖满整屏内容区，内容更高时仍随内容增长。 */
  flex: 1 0 auto;
  /* P3/645:28703（Q08 存量视图全屏框）：查看态画布左右留白 24px（全屏消费方），
     顶部仍 20px，统计卡顶边与设计 144px 对齐 */
  padding: 20px 24px 24px;
  overflow-x: hidden;
}
@media (max-width: 767px) {
  .wsd {
    padding: 20px 16px 24px;
  }
}
.wsd.has-sidebar {
  padding-left: 224px;
}
.wsd.has-sidebar-rail {
  padding-left: 88px;
}
.wsd-canvas-wrap {
  position: relative;
  margin-top: 0;
}
.wsd.is-editing {
  max-width: none;
  height: 100vh;
  padding: 14px 20px 18px;
}
.wsd.is-editing .wsd-canvas-wrap {
  display: flex;
  flex: 1;
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}
.wsd.is-editing .wsd-palette {
  position: static;
  flex: 0 0 260px;
  width: 260px;
  box-shadow: none;
}
.wsd.is-editing .wsd-canvas {
  flex: 1;
}
.wsd.is-editing .wsd-canvas-item__body > .wsd-panel {
  overflow: hidden;
}
.wsd-canvas {
  position: relative;
  min-height: 520px;
}
.wsd-canvas.is-editing {
  background-image: radial-gradient(circle, #d9deeb 1px, transparent 1px);
  background-size: 24px 24px;
  border: 1px dashed #c6cce0;
  border-radius: 12px;
}
.wsd-canvas__empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.wsd-guide {
  position: absolute;
  z-index: 60;
  pointer-events: none;
}
.wsd-guide--v {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--sw-color-primary);
}
.wsd-guide--h {
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--sw-color-primary);
}
.wsd-canvas-item__body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.wsd-canvas-item__body > .wsd-panel {
  height: 100%;
  overflow: auto;
}
.wsd-canvas-item__body > .wsd-stats {
  height: 100%;
}
/* B021-007 批次5：单张独立指标卡撑满其画布槽位 */
.wsd-canvas-item__body > .wsd-stat--single {
  height: 100%;
}
.wsd-panel {
  box-sizing: border-box;
  padding: 16px 20px 20px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wsd-panel__title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-panel__empty {
  margin: 18px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-actrows {
  list-style: none;
  margin: 3px 0 0;
  padding: 0;
}
.wsd-act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* 参考 3:2：业务动态行距 59 */
  height: 58px;
  padding: 0 8px;
  border-bottom: 1px solid var(--sw-border-light);
}
.wsd-act:last-child {
  border-bottom: 0;
}
.wsd-act__title {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: #17213a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
