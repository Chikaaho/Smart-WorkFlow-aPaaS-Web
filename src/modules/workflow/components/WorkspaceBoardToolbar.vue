<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'

/** 编辑态工具栏：恢复默认 / 保存 / 退出编辑（embedded 时按钮归配置弹窗页脚）。 */
defineProps<{
  custom: boolean
  embedded: boolean
  dirty: boolean
}>()

const emit = defineEmits<{ save: []; reset: [] }>()

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="wsd-toolbar">
    <span v-if="!custom" class="wsd-toolbar__badge">{{ t('workspace.defaultLayout') }}</span>
    <div v-if="!embedded" class="wsd-toolbar__actions">
      <button class="wsd-btn" type="button" @click="emit('reset')">
        {{ t('common.restoreDefault') }}
      </button>
      <button
        class="wsd-btn wsd-btn--primary"
        type="button"
        :disabled="!dirty"
        @click="emit('save')"
      >
        {{ t('workflow.saveWorkspaceConfig') }}
      </button>
      <button class="wsd-btn" type="button" @click="router.push('/workspace')">
        {{ t('workspace.exitEdit') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wsd-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding: 10px 14px;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  background: #ffffff;
}
.wsd-toolbar__badge {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eee8ff;
  color: var(--sw-color-primary);
  font-size: 12px;
}
.wsd-toolbar__hint {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-toolbar__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
.wsd-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-btn--primary {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary);
  color: #ffffff;
}
.wsd-btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
