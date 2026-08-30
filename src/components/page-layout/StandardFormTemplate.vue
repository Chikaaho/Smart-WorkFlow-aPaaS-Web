<script setup lang="ts">
/**
 * StandardFormTemplate — 页型A（表单填写/渲染页）标准模板。
 *
 * 组合：页头 H1 + alert 区 + 若干 FormSection → FormActions。
 * 两种模式：
 *   - embedded=false（默认）: 整页表单，外层 max-width 居中容器 + 页头 H1
 *   - embedded=true: 弹窗内嵌，无页头、撑满父级（适配 el-dialog 宽度）
 * 低代码/高代码轨共用同一模板：
 *   - 低代码轨：FormSection > FormGrid > DynamicField
 *   - 高代码轨：FormSection > FormGrid > 手写控件
 *
 * 数据外部进（props + slots），零 onMounted / 零路由耦合。
 */
withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    embedded?: boolean
  }>(),
  {
    title: '',
    subtitle: '',
    embedded: false,
  },
)
</script>

<template>
  <div class="standard-form" :class="{ 'standard-form--embedded': embedded }">
    <!-- 页标题区（embedded 模式下不渲染） -->
    <header v-if="!embedded" class="standard-form__header">
      <h1 class="standard-form__title">{{ title }}</h1>
      <p v-if="subtitle" class="standard-form__subtitle">{{ subtitle }}</p>
    </header>

    <!-- 顶部 alert 提示条（成功绿/失败红，调用方从 slot 进） -->
    <div v-if="$slots.alert" class="standard-form__alert">
      <slot name="alert" />
    </div>

    <!-- 表单分区（调用方组织 FormSection） -->
    <div class="standard-form__body">
      <slot />
    </div>

    <!-- 底部操作栏 -->
    <div v-if="$slots.actions" class="standard-form__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.standard-form {
  max-width: 920px;
  margin: 0 auto;
  padding: var(--sw-space-32) var(--sw-space-24);
}

/* embedded：弹窗内嵌，撑满父级，零外距 */
.standard-form--embedded {
  max-width: none;
  margin: 0;
  padding: 0;
}

.standard-form__header {
  margin-bottom: var(--sw-space-20);
}

.standard-form__title {
  margin: 0;
  font-size: var(--sw-font-h1);
  font-weight: var(--sw-font-weight-h1);
  color: var(--sw-text-primary);
}

.standard-form__subtitle {
  margin: var(--sw-space-8) 0 0;
  font-size: var(--sw-font-secondary);
  font-weight: var(--sw-font-weight-secondary);
  color: var(--sw-text-secondary);
}

.standard-form__alert {
  margin-bottom: var(--sw-space-16);
}

.standard-form__body {
  /* FormSection 自带 margin-bottom */
}

.standard-form__actions {
  margin-top: var(--sw-space-8);
}
</style>
