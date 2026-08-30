<script setup lang="ts">
/**
 * START / END 节点属性面板：无可编辑项，仅空态说明。
 * 说明文案取注册表 label（对齐重构前 NODE_TYPE_LABELS 语义）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <el-empty :description="`${label}节点无可编辑属性`" :image-size="60" />
</template>
