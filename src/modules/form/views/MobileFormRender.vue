<script setup lang="ts">
/**
 * MobileFormRender — I2 移动 Web 表单入口。
 *
 * 复用与 PC 同一渲染内核（DynamicField → DYNAMIC_FIELD_REGISTRY → 同一组件契约、
 * 同一后端提交/草稿/回显 API），移动视口仅做响应式重排：
 *  - 不删减字段、不放宽校验、不绕过权限（校验与权限的权威在服务端）；
 *  - 不承担表单设计（设计仍在 PC 管理端）；
 *  - 路由 /m/form/:formKey，支持与 PC 相同的 recordId/mode/draft 查询参数语义。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import FormRender from './FormRender.vue'

const route = useRoute()
const formKey = computed(() => String(route.params.formKey))
</script>

<template>
  <div class="mobile-form-page">
    <FormRender :key="formKey" class="mobile-form-page__render" />
  </div>
</template>

<style scoped>
/* 移动视口容器：单列满宽，去掉桌面 max-width 居中约束 */
.mobile-form-page {
  min-height: 100vh;
  background: var(--sw-color-fill, #f5f7fa);
  padding: 12px;
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
}

/* 深穿透重排页型 A 桌面约束：容器满宽、字段单列、控件可达（不删字段） */
.mobile-form-page__render :deep(.form-render-page) {
  max-width: 100%;
}

.mobile-form-page__render :deep(.form-render-page__field) {
  grid-column: span 24 !important;
}

.mobile-form-page__render :deep(.el-table) {
  font-size: 13px;
}

/* 操作按钮在窄屏下不横向溢出 */
.mobile-form-page__render :deep(.el-button + .el-button) {
  margin-left: 8px;
}
</style>
