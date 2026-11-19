<script setup lang="ts">
import { useI18n } from '@/locales'
import type { WorkspaceActivityFilter } from './use-workspace-panel'

/** 业务动态面板：真实已办/发起/抄送按时间合并（设计01 chips：全部/审批/抄送/消息）。 */
defineProps<{
  rows: Array<{ title: string; meta: string; time: string }>
  chips: Array<{ key: WorkspaceActivityFilter; label: string }>
  filter: WorkspaceActivityFilter
}>()

const emit = defineEmits<{ 'select-filter': [key: WorkspaceActivityFilter] }>()

const { t } = useI18n()
</script>

<template>
  <section class="wsd-panel wsd-panel--activity">
    <div class="wsd-panel__head">
      <h3 class="wsd-panel__title">{{ t('workspace.activityTitle') }}</h3>
      <div class="wsd-chiprow wsd-chiprow--activity">
        <button
          v-for="c in chips"
          :key="c.key"
          class="wsd-chip"
          :class="{ 'is-active': filter === c.key }"
          type="button"
          @click="emit('select-filter', c.key)"
        >
          {{ c.label }}
        </button>
      </div>
    </div>
    <p v-if="rows.length === 0" class="wsd-panel__empty">
      {{ t('workspace.noActivity') }}
    </p>
    <ul v-else class="wsd-actrows">
      <li v-for="(row, index) in rows" :key="index" class="wsd-act">
        <span class="wsd-act__title">{{ row.title }}</span>
        <span class="wsd-act__right">
          <span class="wsd-act__meta">{{ row.meta }}</span>
          <span class="wsd-act__time">{{ row.time }}</span>
        </span>
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
.wsd-chiprow {
  display: flex;
  gap: 4px;
  margin-top: 0;
}
.wsd-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: var(--sw-text-secondary);
}
.wsd-chip.is-active {
  background: var(--sw-color-primary);
  color: #ffffff;
  font-weight: 500;
}
.wsd-chiprow--activity {
  margin-left: 0;
  margin-top: 0;
  /* 参考 3:2：活跃区胶囊 64 宽、节距 76（间距 12） */
  gap: 12px;
}
/* 参考 3:2：业务动态右缘内容到 x≈1881（面板右内距 18） */
.wsd-panel--activity {
  padding-right: 18px;
}
.wsd-actrows {
  list-style: none;
  margin: 3px 0 0;
  padding: 0;
}
.wsd-actrows {
  /* 参考 3:2：动态首行顶距 1（标题底 807 → 行顶 812） */
  margin-top: 1px;
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
.wsd-act__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.wsd-act__meta {
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
.wsd-act__time {
  font-size: 13px;
  color: var(--sw-text-secondary);
  white-space: nowrap;
}
</style>
