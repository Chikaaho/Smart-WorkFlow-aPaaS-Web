<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
</script>

<template>
  <div class="knowledge-home">
    <el-card shadow="never">
      <el-empty :description="t('agent.knowledgeStage3')" />
    </el-card>
  </div>
</template>

<style scoped>
.knowledge-home {
  padding: 20px;
}
</style>
