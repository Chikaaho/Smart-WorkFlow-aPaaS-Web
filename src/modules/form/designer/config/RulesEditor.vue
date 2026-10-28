<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * RulesEditor — 字段显隐联动规则编辑（v0.0.2 P2）。
 *
 * 语义：目标字段仅在条件满足时可见（每字段至多一条规则，由宿主按 target 存储）。
 * 条件字段可选同表单内任意其他字段；op 支持 EQ/NE/EMPTY/NOT_EMPTY；logic 支持 ALL/ANY。
 * 环依赖由后端发布门校验（前端不重复实现）。
 */
import { computed, ref } from 'vue'
import type { VisibilityRule, VisibilityCondition } from '@/contracts/form-schema'

const props = defineProps<{
  /** 目标字段名（规则 target）。 */
  target: string
  /** 可选条件字段（同表单其他字段名）。 */
  fieldNames: string[]
  /** 当前生效规则；null=未配置。 */
  rule: VisibilityRule | null
}>()

const emit = defineEmits<{ 'update-rule': [rule: VisibilityRule | null] }>()

const hasRule = computed(() => props.rule !== null)

/** 显示条件编辑区展开态：设置按钮切换；已有规则时展开即见条件行。 */
const expanded = ref(false)

function newCondition(): VisibilityCondition {
  return { field: props.fieldNames[0] ?? '', op: 'EQ', value: '' }
}

function onToggle(enabled: string | number | boolean) {
  if (enabled) {
    emit('update-rule', {
      target: props.target,
      logic: 'ALL',
      conditions: [newCondition()],
    })
  } else {
    emit('update-rule', null)
  }
}

function onLogic(logic: 'ALL' | 'ANY') {
  if (props.rule) emit('update-rule', { ...props.rule, logic })
}

function onConditionChange(index: number, patch: Partial<VisibilityCondition>) {
  if (!props.rule) return
  const conditions = props.rule.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c))
  emit('update-rule', { ...props.rule, conditions })
}

function addCondition() {
  if (!props.rule) return
  emit('update-rule', { ...props.rule, conditions: [...props.rule.conditions, newCondition()] })
}

function removeCondition(index: number) {
  if (!props.rule) return
  emit('update-rule', {
    ...props.rule,
    conditions: props.rule.conditions.filter((_, i) => i !== index),
  })
}

function needsValue(op: VisibilityCondition['op']): boolean {
  return op === 'EQ' || op === 'NE'
}
</script>

<template>
  <!-- 0.2.0 G07（42:2）：显示条件行并入高级信息——标签左、设置按钮右；展开后编辑条件 -->
  <div class="rules-editor">
    <div class="rules-editor__head">
      <span class="rules-editor__label">{{ t('form.displayConditionLabel') }}</span>
      <el-button
        class="rules-editor__toggle"
        data-testid="rule-toggle"
        @click="expanded = !expanded"
      >
        {{ t('common.configure') }}
      </el-button>
    </div>

    <template v-if="expanded">
      <template v-if="hasRule && rule">
        <div class="rules-editor__row">
          <span class="rules-editor__hint">{{ t('form.whenLabel') }}</span>
          <el-select
            :model-value="rule.logic"
            size="small"
            style="width: 90px"
            @update:model-value="onLogic"
          >
            <el-option :label="t('form.allConditions')" value="ALL" />
            <el-option :label="t('form.anyCondition')" value="ANY" />
          </el-select>
          <span class="rules-editor__hint">{{ t('form.showThisField') }}</span>
        </div>

        <div v-for="(condition, index) in rule.conditions" :key="index" class="rules-editor__row">
          <el-select
            :model-value="condition.field"
            size="small"
            :placeholder="t('common.field')"
            style="width: 110px"
            @update:model-value="(v: string) => onConditionChange(index, { field: v })"
          >
            <el-option v-for="name in fieldNames" :key="name" :label="name" :value="name" />
          </el-select>
          <el-select
            :model-value="condition.op"
            size="small"
            style="width: 90px"
            @update:model-value="
              (v: VisibilityCondition['op']) => onConditionChange(index, { op: v })
            "
          >
            <el-option :label="t('form.opEquals')" value="EQ" />
            <el-option :label="t('form.opNotEquals')" value="NE" />
            <el-option :label="t('form.opIsEmpty')" value="EMPTY" />
            <el-option :label="t('form.opIsNotEmpty')" value="NOT_EMPTY" />
          </el-select>
          <el-input
            v-if="needsValue(condition.op)"
            :model-value="condition.value ?? ''"
            size="small"
            :placeholder="t('common.value')"
            style="width: 90px"
            @update:model-value="(v: string) => onConditionChange(index, { value: v })"
          />
          <el-button size="small" text type="danger" @click="removeCondition(index)">{{
            t('form.removeCondition')
          }}</el-button>
        </div>

        <div class="rules-editor__row">
          <el-button size="small" text type="primary" @click="addCondition">{{
            t('form.addCondition')
          }}</el-button>
          <el-button size="small" text @click="onToggle(false)">{{
            t('form.clearVisibilityRule')
          }}</el-button>
        </div>
      </template>
      <div v-else class="rules-editor__row">
        <el-switch :model-value="false" @update:model-value="onToggle" />
        <span class="rules-editor__hint">{{ t('form.visibilityRule') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rules-editor {
  margin-bottom: 25px;
}
.rules-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.rules-editor__toggle {
  height: 32px;
  min-width: 64px;
}
.rules-editor__row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.rules-editor__label,
.rules-editor__hint {
  font-size: var(--sw-font-emphasis, 14px);
  color: var(--sw-text-regular);
}
.rules-editor__hint {
  font-size: 12px;
  color: var(--sw-text-secondary, #909399);
}
.rules-editor__note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sw-text-placeholder, #a8abb2);
  line-height: 1.5;
}
</style>
