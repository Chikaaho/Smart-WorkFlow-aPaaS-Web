<script setup lang="ts">
/**
 * FORK 节点属性面板：扇出，无 config 编辑项，仅静态说明（分支语义落在出边）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <el-alert
    title="并行分支节点：出边数 = 并行分支数（≥2），各分支并发执行后可在 JOIN 汇合"
    type="info"
    :closable="false"
    show-icon
  />
</template>
