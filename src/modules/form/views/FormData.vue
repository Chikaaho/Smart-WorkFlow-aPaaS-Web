<script setup lang="ts">
/**
 * 管理端表单数据页 —— 仅提供路由参数，列表实现统一由 FormDataList 承载。
 */
import { useRoute } from 'vue-router'
import FormDataList from '@/modules/form/components/FormDataList.vue'

const route = useRoute()
const formKey = String(route.params.formKey)
</script>

<template>
  <FormDataList :form-key="formKey" />
</template>
