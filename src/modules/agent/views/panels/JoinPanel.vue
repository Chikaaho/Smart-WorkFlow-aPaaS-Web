<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * JOIN 节点属性面板：汇合，无 config 编辑项，仅静态说明（入边 = 汇合分支）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <el-alert :title="t('agent.joinNodeHint')" type="info" :closable="false" show-icon />
</template>
