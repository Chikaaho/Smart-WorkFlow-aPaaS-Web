<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import {
  Bell,
  CircleCheck,
  Clock,
  EditPen,
  Expand,
  Fold,
  Grid,
  Tickets,
} from '@element-plus/icons-vue'

/** 设计01 批次2：左侧深色工作台侧栏（可折起为窄轨）；仅查看态。 */
const collapsed = defineModel<boolean>('collapsed', { required: true })

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const sidebarItems = computed(() => [
  { label: t('common.workspace'), icon: Grid, path: '/workspace' },
  { label: t('workflow.todoTasks'), icon: Tickets, path: '/workspace/todo' },
  { label: t('common.startedByMe'), icon: Clock, path: '/workspace/my-instances' },
  { label: t('workflow.processedTasks'), icon: CircleCheck, path: '/workspace/processed' },
  { label: t('router.myCc'), icon: Bell, path: '/workspace/my-cc' },
  { label: t('workflow.myDrafts'), icon: EditPen, path: '/workspace/my-drafts' },
])
</script>

<template>
  <aside class="wsd-sidebar" :class="{ 'is-collapsed': collapsed }" data-testid="workspace-sidebar">
    <nav class="wsd-sidebar__nav">
      <button
        v-for="item in sidebarItems"
        :key="item.path"
        type="button"
        class="wsd-sidebar__item"
        :class="{ 'is-active': route.path === item.path }"
        :title="item.label"
        @click="router.push(item.path)"
      >
        <el-icon :size="16"><component :is="item.icon" /></el-icon>
        <span v-if="!collapsed" class="wsd-sidebar__label">{{ item.label }}</span>
      </button>
    </nav>
    <button
      type="button"
      class="wsd-sidebar__toggle"
      :title="collapsed ? t('workspace.sidebarExpand') : t('workspace.sidebarCollapse')"
      @click="collapsed = !collapsed"
    >
      <el-icon :size="14"><component :is="collapsed ? Expand : Fold" /></el-icon>
      <span v-if="!collapsed">{{ t('workspace.sidebarCollapse') }}</span>
    </button>
  </aside>
</template>

<style scoped>
/* B021-007 批次2：设计01 左侧深色工作台侧栏（可折起为窄轨），吸附视口左缘、顶栏下方；
   查看态内容整体右移让出侧栏，编辑态无侧栏。 */
.wsd-sidebar {
  position: fixed;
  z-index: 30;
  top: 64px;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 200px;
  padding: 16px 12px;
  background: #172033;
  transition: width 0.15s ease;
}
.wsd-sidebar.is-collapsed {
  width: 64px;
  padding: 16px 8px;
}
.wsd-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.wsd-sidebar__item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(255 255 255 / 72%);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.wsd-sidebar__item:hover {
  background: rgb(255 255 255 / 8%);
  color: #fff;
}
.wsd-sidebar__item.is-active {
  background: var(--sw-color-primary, #2563eb);
  color: #fff;
}
.wsd-sidebar__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-sidebar.is-collapsed .wsd-sidebar__item {
  justify-content: center;
  padding: 0;
}
.wsd-sidebar__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(255 255 255 / 60%);
  font-size: 12px;
  cursor: pointer;
}
.wsd-sidebar__toggle:hover {
  background: rgb(255 255 255 / 8%);
  color: #fff;
}
.wsd-sidebar.is-collapsed .wsd-sidebar__toggle {
  justify-content: center;
  padding: 0;
}
</style>
