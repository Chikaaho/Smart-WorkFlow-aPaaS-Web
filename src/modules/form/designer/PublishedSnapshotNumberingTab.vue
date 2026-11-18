<script setup lang="ts">
import { useI18n } from '@/locales'
import { prettyJson, useSnapshotLabels } from './use-snapshot-labels'

/** 编号设置页签：冻结编号规则（无冻结数据时同布局空态）。 */
defineProps<{
  frozenNumbering: unknown
}>()

const { t } = useI18n()
const { sectionLabel } = useSnapshotLabels()
</script>

<template>
  <!-- ═══ 编号设置：冻结编号规则（无冻结数据时同布局空态） ═══ -->
  <div class="snapshot-tabbody snapshot-tabbody--full">
    <section class="snapshot-section">
      <div class="snapshot-section__head">
        <div>
          <h3>{{ sectionLabel('numbering') }}</h3>
        </div>
      </div>
      <p v-if="!frozenNumbering" class="snapshot-empty">
        {{ t('form.snapshotViewer.numberingMissing') }}
      </p>
      <details v-else class="snapshot-raw snapshot-raw--card">
        <summary>{{ t('form.snapshotViewer.rawConfig') }}</summary>
        <pre>{{ prettyJson(frozenNumbering) }}</pre>
      </details>
    </section>
  </div>
</template>

<style scoped>
.snapshot-tabbody--full {
  box-sizing: border-box;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.snapshot-section__head h3 {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
}

.snapshot-raw {
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-page);
}

.snapshot-raw summary {
  padding: 9px 12px;
  color: var(--sw-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.snapshot-raw--card summary {
  padding: 7px 9px;
}

.snapshot-raw--card {
  margin-bottom: 8px;
}

.snapshot-raw pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  color: var(--sw-text-primary);
  font: 12px/1.65 var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--sw-surface-page);
}

.snapshot-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

@media (max-width: 900px) {
  .snapshot-tabbody--full {
    max-height: 58vh;
  }
}
</style>
