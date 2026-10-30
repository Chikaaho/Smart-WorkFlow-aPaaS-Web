<script setup lang="ts">
import { useI18n } from '@/locales'
import HintTip from '@/components/HintTip.vue'

const { t } = useI18n()
/**
 * FORK 节点属性面板：扇出，无 config 编辑项，仅静态说明（分支语义落在出边）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <div class="panel-help"><HintTip :content="t('agent.forkPanelHint')" /></div>
</template>

<style scoped>
.panel-help {
  display: flex;
  justify-content: flex-end;
}
</style>
