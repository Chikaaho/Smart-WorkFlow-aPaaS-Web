<script setup lang="ts">
import { computed } from 'vue'
import { useDict } from './index'

const props = defineProps<{ type: string; value: string }>()
const { items } = useDict(props.type)
const label = computed(
  () => items.value.find((item) => item.value === props.value)?.label ?? String(props.value),
)
</script>

<template>
  <span>{{ label }}</span>
</template>
