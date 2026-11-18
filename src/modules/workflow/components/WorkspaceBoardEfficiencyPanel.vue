<script setup lang="ts">
import { useI18n } from '@/locales'

/** 流程效能面板：上方双指标（平均时长/完成率）、下方三分项，无进度条/彩色边框盒。 */
defineProps<{
  avgDurationText: string
  completionPct: number | null
  effBoxes: Array<{ label: string; value: string; color: string }>
}>()

const { t } = useI18n()
</script>

<template>
  <section class="wsd-panel wsd-panel--eff">
    <div class="wsd-panel__head">
      <h3 class="wsd-panel__title">{{ t('workspace.efficiencyTitle') }}</h3>
      <span class="wsd-panel__hint">{{ t('workspace.last7Days') }}</span>
    </div>
    <div class="wsd-eff-top">
      <div class="wsd-eff-metric">
        <span class="wsd-eff-metric__label">{{ t('workspace.avgDuration') }}</span>
        <strong class="wsd-eff-metric__value">{{ avgDurationText }}</strong>
      </div>
      <div class="wsd-eff-metric">
        <span class="wsd-eff-metric__label">{{ t('workspace.completionRate') }}</span>
        <strong class="wsd-eff-metric__value">{{
          completionPct != null ? completionPct + '%' : '—'
        }}</strong>
      </div>
    </div>
    <div class="wsd-eff-bottom">
      <div v-for="b in effBoxes" :key="b.label" class="wsd-eff-box">
        <span class="wsd-eff-box__label">{{ b.label }}</span>
        <strong class="wsd-eff-box__value">{{ b.value }}</strong>
      </div>
    </div>
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
.wsd-panel__hint {
  font-size: 14px;
  color: var(--sw-text-secondary);
  margin-right: 6px;
}
.wsd-panel--eff .wsd-panel__hint {
  width: auto;
  margin-right: 0;
  font-size: 12px;
}
/* 设计01：效能卡上方双指标、下方三分项，无进度条/彩色边框盒 */
.wsd-eff-top {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 22px;
}
.wsd-eff-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wsd-eff-metric__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-metric__value {
  font-size: 28px;
  line-height: 36px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-eff-bottom {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 23px;
  padding-top: 16px;
  border-top: 1px solid var(--sw-border-light);
}
.wsd-eff-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  border: 0;
}
.wsd-eff-box__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-box__value {
  font-size: 20px;
  line-height: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
</style>
