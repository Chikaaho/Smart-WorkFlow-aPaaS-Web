<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'
import { ApiError, isRetryable, categoryRecovery } from '@/foundation/request'
import type { FailureCategory } from '@/foundation/request'

/**
 * LoadErrorState — 加载失败的统一错误态（P61 §3.5 / R2b）。
 *
 * 三件事必须同时成立，否则「失败」会被用户读成「没有数据」或「系统坏了」：
 *   1. 结论：来自失败分类的安全文案（网络中断 / 超时 / 401 / 403 / 404 / 409 / 5xx / 客户端异常各不相同）；
 *   2. 恢复动作：该类别的下一步指引，配置/权限类不写成「稍后重试」；
 *   3. 重试入口：可重试类别给出重试按钮，点击后由父组件真正重新发起请求。
 *
 * 组件本身不发请求，只负责呈现与转发 `retry`；页面保留自己的加载状态。
 */
const props = defineProps<{
  /** 归一化后的失败对象；未提供时按 fallback 文案呈现。 */
  error?: ApiError | null
  /** 非 ApiError 的兜底结论。 */
  fallback?: string
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()

const category = computed<FailureCategory | null>(() => props.error?.category ?? null)

const message = computed(() => props.error?.msg || props.fallback || t('common.loadFailed'))

/** 恢复动作只对有稳定分类的失败给出，避免对未知错误编造处置建议。 */
const recovery = computed(() => (category.value ? categoryRecovery(category.value) : ''))

/** 配置/权限类失败重试没有意义，不给重试按钮，避免诱导重复操作。 */
const canRetry = computed(() => (category.value ? isRetryable(category.value) : true))
</script>

<template>
  <el-alert
    class="load-error"
    type="error"
    show-icon
    :closable="false"
    data-testid="load-error-state"
  >
    <template #title>
      <span data-testid="load-error-message">{{ message }}</span>
    </template>
    <div class="load-error__body">
      <p v-if="recovery" class="load-error__recovery" data-testid="load-error-recovery">
        {{ recovery }}
      </p>
      <p v-if="error?.eventRef" class="load-error__event" data-testid="load-error-eventref">
        {{ t('common.eventReference') }}：{{ error.eventRef }}
      </p>
      <el-button
        v-if="canRetry"
        link
        type="primary"
        class="load-error__retry"
        data-testid="load-error-retry"
        @click="emit('retry')"
      >
        {{ t('common.retry') }}
      </el-button>
    </div>
  </el-alert>
</template>

<style scoped>
.load-error__body {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.load-error__recovery {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.load-error__event {
  margin: 0;
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}
</style>
