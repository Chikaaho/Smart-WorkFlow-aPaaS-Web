<script setup lang="ts">
/**
 * 配置项 seam 占位说明。
 *
 * 第二刀决策：占位提示 / 默认值 / 最小 / 最大 / 步长·精度 / 日期格式 等配置项
 * 在当前 FormSchemaField 契约里**没有落点键**，按硬约束「禁自造键」一律不写回。
 * 这里把这些「待契约扩展后接入」的配置项以只读说明列出，既不误导作者，也标清 seam。
 * 将来契约扩展出对应键，把对应项从此列表移入真实控件即可，宿主与其它面板零改。
 */
defineProps<{
  /** 本类型待接入（无契约键）的配置项中文名列表。 */
  items: string[]
}>()
</script>

<template>
  <div class="seam">
    <p class="seam__title">以下配置待契约扩展后接入（本刀不自造键）</p>
    <ul class="seam__list">
      <li v-for="it in items" :key="it">{{ it }}</li>
    </ul>
  </div>
</template>

<style scoped>
.seam {
  margin-top: var(--sw-space-20);
  padding: var(--sw-space-12) var(--sw-space-16);
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}

.seam__title {
  margin: 0 0 var(--sw-space-8);
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}

.seam__list {
  margin: 0;
  padding-left: var(--sw-space-16);
  font-size: var(--sw-font-caption);
  color: var(--sw-text-placeholder);
}

.seam__list li {
  line-height: 1.8;
}
</style>
