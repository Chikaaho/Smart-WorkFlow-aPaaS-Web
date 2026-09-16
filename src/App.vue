<script setup lang="ts">
/**
 * 应用壳：Element Plus 内建文案跟随同一语言（P61 §3.3），
 * 避免分页/空表/下拉等内建文案与页面文案中英混杂。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { elementPlusLocale } from '@/locales'

const { locale } = useI18n()
const epLocale = computed(() => elementPlusLocale(locale.value as 'zh-CN' | 'en-US'))
</script>

<template>
  <el-config-provider :locale="epLocale">
    <router-view />
  </el-config-provider>
</template>
