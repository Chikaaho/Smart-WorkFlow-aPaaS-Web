<script setup lang="ts">
/**
 * 语言切换（P61 §3.3）：登录页与登录后应用壳共用同一入口。
 * 切换后 Web 文案、Element Plus 内建文案、`<html lang>` 与 Server 消息语言同步生效。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale, type AppLocale } from '@/locales'

const { t, locale } = useI18n()

const options = computed(() =>
  SUPPORTED_LOCALES.map((value) => ({ value, label: t(`locale.${value}`) })),
)

function onChange(value: AppLocale) {
  setLocale(value)
}
</script>

<template>
  <el-select
    class="locale-switch"
    :model-value="locale"
    :aria-label="t('locale.switch')"
    size="small"
    @update:model-value="onChange"
  >
    <el-option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    />
  </el-select>
</template>

<style scoped>
.locale-switch {
  min-width: 96px;
}
</style>
