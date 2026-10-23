<script setup lang="ts">
withDefaults(
  defineProps<{
    plain?: boolean
    multiline?: boolean
    leadingIcon?: string
    trailingIcon?: string
  }>(),
  {
    plain: false,
    multiline: false,
    leadingIcon: '',
    trailingIcon: '',
  },
)
function iconMask(source: string) {
  return { maskImage: `url("${source}")` }
}
</script>

<template>
  <div
    class="readonly-value"
    :class="{ 'readonly-value--plain': plain, 'readonly-value--multiline': multiline }"
  >
    <span
      v-if="leadingIcon && !plain"
      class="readonly-value__icon"
      :style="iconMask(leadingIcon)"
      aria-hidden="true"
    />
    <slot />
    <span
      v-if="trailingIcon && !plain"
      class="readonly-value__icon"
      :style="iconMask(trailingIcon)"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.readonly-value {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.readonly-value--multiline {
  display: block;
  min-height: 80px;
  padding: 10px 12px;
}
.readonly-value__icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  background: var(--sw-text-placeholder);
  mask-size: 16px 16px;
  mask-repeat: no-repeat;
  mask-position: center;
}
.readonly-value--plain {
  display: block;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}
</style>
