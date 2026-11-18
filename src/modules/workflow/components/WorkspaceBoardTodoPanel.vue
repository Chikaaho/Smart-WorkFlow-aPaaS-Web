<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import { Document } from '@element-plus/icons-vue'
import type { TodoPanelTab } from './use-workspace-panel'

/** 我的待办面板：待办/已办/抄送/草稿四页签 + 真实列表行（标题/元信息/期限/办理）。 */
defineProps<{
  tabs: Array<{ key: TodoPanelTab; label: string; count: number }>
  activeTab: TodoPanelTab
  rows: Array<Record<string, unknown>>
  rowTitle: (row: Record<string, unknown>) => string
  rowMeta: (row: Record<string, unknown>) => string
  dueChip: (row: Record<string, unknown>) => string
  isOverdue: (row: Record<string, unknown>) => boolean
  openPanelTask: (row: Record<string, unknown>) => void
}>()

const emit = defineEmits<{ 'select-tab': [key: TodoPanelTab] }>()

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <section class="wsd-panel wsd-panel--todo">
    <div class="wsd-panel__head">
      <h3 class="wsd-panel__title">{{ t('workflow.myTodoTitle') }}</h3>
      <button class="wsd-btn" type="button" @click="router.push('/workspace/todo')">
        {{ t('workspace.allTodos') }}
      </button>
    </div>
    <div class="wsd-tabrow" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="wsd-tab"
        :class="{ 'is-active': activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="emit('select-tab', tab.key)"
      >
        {{ tab.label }} <span class="wsd-tab__count">{{ tab.count }}</span>
      </button>
    </div>
    <p v-if="rows.length === 0" class="wsd-panel__empty">
      {{ t('workflow.noTodoTasks') }}
    </p>
    <ul v-else class="wsd-taskrows">
      <li v-for="(row, index) in rows" :key="index" class="wsd-task">
        <el-icon class="wsd-task__icon" :size="18"><Document /></el-icon>
        <span class="wsd-task__main">
          <button class="wsd-task__title" type="button" @click="openPanelTask(row)">
            {{ rowTitle(row) }}
          </button>
          <span class="wsd-task__meta">{{ rowMeta(row) }}</span>
        </span>
        <span
          class="wsd-task__due"
          :class="{ 'is-empty': !dueChip(row), 'is-overdue': isOverdue(row) }"
          >{{ dueChip(row) }}</span
        >
        <button class="wsd-task__action" type="button" @click="openPanelTask(row)">
          {{ t('workspace.handleTask') }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
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
.wsd-panel__head .wsd-btn {
  margin-right: 16px;
}
/* 设计01：「全部待办」为无边框文字入口 */
.wsd-panel--todo .wsd-btn {
  box-sizing: border-box;
  width: auto;
  height: auto;
  margin-right: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary);
  transform: none;
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
.wsd-tabrow {
  display: flex;
  gap: 16px;
  margin-top: 16px;
}
.wsd-tab {
  display: inline-flex;
  flex: 0 0 100px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  position: relative;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  font-size: 14px;
  color: var(--sw-color-primary);
  cursor: pointer;
}
.wsd-tab.is-active {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.wsd-taskrows {
  list-style: none;
  /* 参考 3:2：页签底 349、首行顶 353（间距 4） */
  margin: 4px 0 0;
  padding: 0;
}
.wsd-task {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  /* 参考 3:2：待办行距 63（标题 20 + 2 + 副注 18 + 上下 11 + 1 分隔线） */
  padding: 11px 8px;
  border-bottom: 1px solid var(--sw-border-light);
}
.wsd-task:last-child {
  border-bottom: 0;
}
.wsd-task__icon {
  color: var(--sw-color-primary);
}
.wsd-task__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wsd-task__title {
  display: block;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  color: #17213a;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-task__meta {
  display: block;
  font-size: 13px;
  line-height: 18px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wsd-task__due {
  padding: 4px 10px;
  border-radius: 4px;
  background: #f2ecff;
  color: var(--sw-color-primary);
  font-size: 12px;
  white-space: nowrap;
}
/* 无期限数据时保留占位列（避免「办理」因空列前移 12px 脱离参考右缘） */
.wsd-task__due.is-empty {
  padding: 0;
  background: transparent;
}
/* 已过期仍待办：文字保持真实期限，仅用语义色如实标示（不伪造期限/文案） */
.wsd-task__due.is-overdue {
  background: var(--sw-danger-bg);
  color: var(--sw-danger);
}
.wsd-task__action {
  /* 参考 3:2：「办理」文字右缘 x≈1258（行内容右缘 1266 − 8） */
  padding: 0 8px;
  border: 0;
  background: none;
  color: var(--sw-color-primary);
  font-size: 14px;
  cursor: pointer;
}
</style>
