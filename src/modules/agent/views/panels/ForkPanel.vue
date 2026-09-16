<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * FORK 节点属性面板：扇出，无 config 编辑项，仅静态说明（分支语义落在出边）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <el-alert :title="t('agent.forkPanelHint')" type="info" :closable="false" show-icon />
</template>
