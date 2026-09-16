<script setup lang="ts">
import { useI18n } from '@/locales'

import { computed } from 'vue'

const { t } = useI18n()
/**
 * ListEmpty — 空态占位。
 * 包装 el-empty，文案/间距走 --sw-* token。
 * #action slot 可选，如"新建"按钮。
 */
const props = defineProps<{ description?: string }>()

// defineProps 会被提升到 setup 之外，默认值不能引用 t()；默认文案在渲染期解析
const description = computed(() => props.description ?? t('common.emptyData'))
</script>

<template>
  <div class="list-empty">
    <el-empty :description="description">
      <template v-if="$slots.action" #default>
        <slot name="action" />
      </template>
    </el-empty>
  </div>
</template>

<style scoped>
.list-empty {
  padding: var(--sw-space-32) 0;
  color: var(--sw-text-secondary);
}
</style>
