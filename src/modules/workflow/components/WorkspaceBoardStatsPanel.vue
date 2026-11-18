<script setup lang="ts">
/**
 * 统计概览面板：独立指标卡（statTodo/statInitiated/statProcessed/statDrafts）
 * 或四格统计概览；数值全部为真实 total。
 */
export interface WorkspaceStatRow {
  key: string
  label: string
  value: number
  helper?: string
}

defineProps<{
  /** 独立指标卡（B021-007 批次5）：传入时渲染单卡形态 */
  metric?: WorkspaceStatRow | null
  /** 四格统计概览 */
  rows?: WorkspaceStatRow[]
  statIcons: Record<string, { icon: unknown; bg: string; color: string }>
}>()
</script>

<template>
  <div v-if="metric" class="wsd-stat wsd-stat--single">
    <span class="wsd-stat__label">{{ metric.label }}</span>
    <span class="wsd-stat__value">{{ metric.value }}</span>
    <span v-if="metric.helper" class="wsd-stat__badge">{{ metric.helper }}</span>
    <span
      class="wsd-stat__iconbg"
      :style="{
        background: statIcons[metric.key]?.bg,
        color: statIcons[metric.key]?.color,
      }"
    >
      <el-icon :size="20">
        <component :is="statIcons[metric.key]?.icon" />
      </el-icon>
    </span>
  </div>
  <div v-else class="wsd-stats">
    <div v-for="s in rows" :key="s.key" class="wsd-stat">
      <span class="wsd-stat__label">{{ s.label }}</span>
      <span class="wsd-stat__value">{{ s.value }}</span>
      <span v-if="s.helper" class="wsd-stat__badge">{{ s.helper }}</span>
      <span
        class="wsd-stat__iconbg"
        :style="{ background: statIcons[s.key]?.bg, color: statIcons[s.key]?.color }"
      >
        <el-icon :size="20"><component :is="statIcons[s.key]?.icon" /></el-icon>
      </span>
    </div>
  </div>
</template>

<style scoped>
.wsd-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  align-content: start;
}
.wsd-stat {
  position: relative;
  box-sizing: border-box;
  min-height: 96px;
  padding: 16px 48px 16px 20px;
  background: #ffffff;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
}
.wsd-stat__label {
  display: block;
  overflow-wrap: break-word;
  font-size: 14px;
  line-height: 22px;
  color: var(--sw-text-secondary);
}
.wsd-stat__value {
  display: block;
  margin-top: 2px;
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-stat__badge {
  position: absolute;
  right: 20px;
  bottom: 14px;
  left: auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--sw-text-secondary);
}
.wsd-stat__iconbg {
  position: absolute;
  right: 20px;
  top: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}
</style>
