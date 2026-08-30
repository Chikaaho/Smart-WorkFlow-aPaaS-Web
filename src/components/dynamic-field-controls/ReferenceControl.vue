<script setup lang="ts">
/**
 * 引用（REFERENCE）控件：只读输入框 + 弹窗选择器（ReferenceSelector）。
 * 弹窗显隐与回显显示值均为本组件内部状态；选择结果经 emit 出（id 落库、value 展示）。
 * 只读语义：输入框始终只读 + readonly 时禁用「选择」按钮（且 targetFormId 缺失时禁用）。
 */
import { computed, ref } from 'vue'
import type { IdValueProperty, ReferenceField } from '@/contracts/form-schema'
import ReferenceSelector from '@/modules/form/components/ReferenceSelector.vue'
import type { DynamicFieldControlProps } from '../dynamic-field-registry'

const props = defineProps<DynamicFieldControlProps>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

const strVal = computed(() => String(props.modelValue ?? ''))

/** targetFormId 仅在 REFERENCE 判别子下存在（子表单元格场景不会渲染本组件）。 */
const targetFormId = computed(() =>
  props.field.type === 'REFERENCE' ? (props.field as ReferenceField).targetFormId : undefined,
)

/* ── 选择器状态 ── */
const referenceSelectorVisible = ref(false)
/** 从选择器回填的显示值（UI 用），v1 编辑回显无法反查时仍显示原始 ID。 */
const referenceDisplayValue = ref('')

const referenceDisplayText = computed(
  () => props.referenceLabel || referenceDisplayValue.value || strVal.value,
)

function onReferenceSelect(payload: IdValueProperty) {
  referenceDisplayValue.value = payload.value
  emit('update:modelValue', payload.id)
}
</script>

<template>
  <div class="dynamic-field__reference">
    <el-input :model-value="referenceDisplayText" placeholder="请选择关联记录" readonly>
      <template #append>
        <el-button :disabled="readonly || !targetFormId" @click="referenceSelectorVisible = true">
          选择
        </el-button>
      </template>
    </el-input>
    <ReferenceSelector
      v-if="referenceSelectorVisible"
      v-model:visible="referenceSelectorVisible"
      :target-form-key="targetFormId ?? ''"
      :selected-id="strVal"
      @select="onReferenceSelect"
    />
  </div>
</template>

<style scoped>
.dynamic-field__reference {
  width: 100%;
}
</style>
