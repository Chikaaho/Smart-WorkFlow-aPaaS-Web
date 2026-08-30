<script setup lang="ts">
/**
 * JOIN 节点属性面板：汇合，无 config 编辑项，仅静态说明（入边 = 汇合分支）。
 */
import type { NodePanelProps } from './node-panel-registry'

defineProps<NodePanelProps>()
</script>

<template>
  <el-alert
    title="汇合节点：入边数 = 汇合分支数（≥2），等待全部分支到达后合并单点继续"
    type="info"
    :closable="false"
    show-icon
  />
</template>
