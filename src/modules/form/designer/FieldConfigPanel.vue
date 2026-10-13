<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 配置面板（设计器右栏）—— 宿主只按注册表动态挂载，禁写死类型 switch。
 *
 * P53 节点07 三段结构：
 *  - 基础信息：组件名称 / 宽度（6 档百分比）/ 占位提示 / 必填（全部走 FieldPatch 通用键）；
 *  - 高级信息：字段标识 / 数据类型族 / 类型专属配置（configComponent 动态挂载）；
 *  - 其他信息：扩展属性预留区。
 *
 * 配置面板改动经 @update 抛 FieldPatch，本宿主原样上交给设计器写回选中字段（单一数据源）。
 */
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getFieldTypeDescriptor, getFieldTypeStorage } from './field-types'
import { isColumnNameUnique } from './column-name'
import type { DesignerItem } from './types'
import type { FieldPatch } from './field-config'
import RulesEditor from './config/RulesEditor.vue'
import ScriptConfig from './ScriptConfig.vue'
import { WIDTH_COL_STEPS, widthStepPercent } from './width-steps'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'
import {
  DEFAULT_FIELD_LABEL_POSITION,
  type FieldLabelPosition,
  type VisibilityRule,
} from '@/contracts/form-schema'

/** 系统固定前缀：字段标识仅暴露后缀编辑（V011-BUG-016）。 */
const FIELD_KEY_PREFIX = 'field_'

const props = withDefaults(
  defineProps<{
    field: DesignerItem | null
    /** 同表单内**其它**字段的列名（不含选中字段），透传给配置面板做重名校验。 */
    otherNames: string[]
    /** 已发布表单：禁止编辑配置。 */
    readonly?: boolean
    /** V011-BUG-016：字段标识锁定（已发布表单），与面板整体编辑解锁解耦。 */
    keyLocked?: boolean
    /** 选中字段当前的显隐规则（null=未配置）。 */
    rule?: VisibilityRule | null
    /** 同表单全部字段名（规则条件候选，含选中字段以外的字段）。 */
    ruleFieldNames?: string[]
    /** 子表子字段上下文（P63）：子画布复用本面板时置 true，配置面板据此隐藏主表专属配置。 */
    subfield?: boolean
  }>(),
  { readonly: false, keyLocked: false, rule: null, ruleFieldNames: () => [], subfield: false },
)

const emit = defineEmits<{
  update: [patch: FieldPatch]
  'update-rule': [rule: VisibilityRule | null]
}>()

const descriptor = computed(() =>
  props.field ? getFieldTypeDescriptor(props.field.field.type) : undefined,
)

const colSpan = computed(() =>
  props.field ? normalizeFormFieldColSpan(props.field.field.colSpan, props.field.field.type) : 12,
)

/**
 * 宽度选项 = 与画布拖拽同源的 6 档（100/83/67/50/33/17）+ 当前值。
 * 历史自定义宽度不在档位内时补一条当前项，避免选择器空显；切到其它档位后该临时项自然消失。
 */
const widthOptions = computed<Array<{ cols: number; pct: number }>>(() => {
  const options = WIDTH_COL_STEPS.map((cols) => ({ cols, pct: widthStepPercent(cols) }))
  const current = colSpan.value
  if (!options.some((option) => option.cols === current)) {
    options.push({ cols: current, pct: widthStepPercent(current) })
    options.sort((a, b) => b.cols - a.cols)
  }
  return options
})

/** 标题位置选项（BF20261013-011：收敛为 左边 / 右边 / 上边 三种）。 */
const LABEL_POSITION_OPTIONS: ReadonlyArray<{ value: FieldLabelPosition; key: string }> = [
  { value: 'left', key: 'form.labelPositionLeft' },
  { value: 'right', key: 'form.labelPositionRight' },
  { value: 'top-left', key: 'form.labelPositionTopLeft' },
]

/**
 * 当前字段标题位置（缺省上边）。文字组件无独立标题，不展示该行。
 * 历史定义的上面右对齐/居中归一到「上边」展示（再次选择时写回 top-left）。
 */
const labelPosition = computed<FieldLabelPosition>(() => {
  const raw = props.field?.field.labelPosition ?? DEFAULT_FIELD_LABEL_POSITION
  return raw === 'top-right' || raw === 'top-center' ? 'top-left' : raw
})

const showLabelPosition = computed(() => props.field?.field.type !== 'LABEL')

function onLabelPosition(value: FieldLabelPosition) {
  emit('update', { labelPosition: value })
}

/** 宽度选择：选项值即 24 栅格列数。 */
function onWidthChange(cols: number | undefined) {
  if (!props.field || !cols) return
  emit('update', { colSpan: normalizeFormFieldColSpan(cols, props.field.field.type) })
}

/** 数据类型族展示（BF20261013-009：下拉多选提交为 key 数组，存储族显示 JSON）。 */
const storageLabel = computed(() => {
  if (!props.field) return ''
  if (props.field.field.type === 'DICT' && props.field.field.multiple) return 'JSON'
  return getFieldTypeStorage(props.field.field.type)
})

/** 字段标识后缀展示：field_ 前缀被系统吃掉，用户只见后缀（V011-BUG-016）。 */
const fieldKeySuffix = computed(() => {
  const name = props.field?.field.name ?? ''
  return name.startsWith(FIELD_KEY_PREFIX) ? name.slice(FIELD_KEY_PREFIX.length) : name
})

/**
 * 后缀编辑 → 全名 = field_ + 后缀（小写化、剔除非法字符）。
 * 空后缀不回写；与其它字段重名时提示并放弃本次输入。列名校验复用 column-name 纯函数。
 */
function onFieldKeySuffix(raw: string) {
  if (!props.field) return
  const suffix = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  if (!suffix) return
  const next = FIELD_KEY_PREFIX + suffix
  if (next === props.field.field.name) return
  if (!isColumnNameUnique(next, props.otherNames)) {
    ElMessage.warning(t('form.fieldKeyDuplicate'))
    return
  }
  emit('update', { name: next })
}
</script>

<template>
  <aside class="config">
    <div class="config__head">
      <h2 class="config__title">{{ t('form.fieldSettingsTitle') }}</h2>
      <span v-if="field" class="config__type">{{ descriptor?.label ?? field.field.type }}</span>
    </div>

    <p v-if="!field" class="config__hint">{{ t('form.selectFieldHint') }}</p>

    <template v-else>
      <!-- ═══ 基础信息 ═══ -->
      <h3 class="config__section">{{ t('form.sectionBasicInfo') }}</h3>
      <div class="config__row">
        <label class="config__label">{{ t('fieldList.colName') }}</label>
        <el-input
          :model-value="field.field.label ?? ''"
          :disabled="readonly"
          @update:model-value="(v: string) => emit('update', { label: v })"
        />
      </div>
      <div class="config__row">
        <label class="config__label">{{ t('form.widthLabel') }}</label>
        <!-- BF20261013-016：选项 = 左侧宽度示意图 + 右侧百分比（值写回 24 栅格列数） -->
        <el-select :model-value="colSpan" :disabled="readonly" @update:model-value="onWidthChange">
          <el-option
            v-for="option in widthOptions"
            :key="option.cols"
            :value="option.cols"
            :label="`${option.pct}%`"
          >
            <span class="width-option">
              <span class="width-option__gauge"><i :style="{ width: `${option.pct}%` }" /></span>
              <span class="width-option__pct">{{ option.pct }}%</span>
            </span>
          </el-option>
        </el-select>
      </div>
      <div v-if="showLabelPosition" class="config__row">
        <label class="config__label">{{ t('form.labelPositionLabel') }}</label>
        <el-select
          :model-value="labelPosition"
          :disabled="readonly"
          @update:model-value="onLabelPosition"
        >
          <el-option
            v-for="option in LABEL_POSITION_OPTIONS"
            :key="option.value"
            :value="option.value"
            :label="t(option.key)"
          />
        </el-select>
      </div>
      <div class="config__row">
        <label class="config__label">{{ t('form.placeholderHint') }}</label>
        <el-input
          :model-value="field.field.placeholder ?? ''"
          :disabled="readonly"
          @update:model-value="(v: string) => emit('update', { placeholder: v })"
        />
      </div>
      <div class="config__row config__row--inline">
        <label class="config__label">{{ t('form.requiredToggleLabel') }}</label>
        <!-- BF20261013-013：必填改为「是否必填」+ 勾选框（原状态徽标替换） -->
        <el-checkbox
          :model-value="field.field.required ?? false"
          :disabled="readonly"
          @update:model-value="
            (v: string | number | boolean) => emit('update', { required: Boolean(v) })
          "
        />
      </div>

      <!-- ═══ 高级信息 ═══ -->
      <h3 class="config__section">{{ t('form.sectionAdvancedInfo') }}</h3>
      <div class="config__row">
        <label class="config__label">{{ t('form.fieldKeyLabel') }}</label>
        <!-- V011-BUG-016：未发布表单的字段标识可编辑——用户只输入后缀，系统前缀固定 field_；
             已发布（keyLocked）仍锁定并提示不可直接修改 -->
        <el-input
          :model-value="fieldKeySuffix"
          :disabled="keyLocked"
          :maxlength="58"
          @update:model-value="onFieldKeySuffix"
        >
          <template #prepend>field_</template>
        </el-input>
      </div>
      <div v-if="field.field.type === 'TEXT'" class="config__type-pair">
        <div class="config__row">
          <label class="config__label">{{ t('fieldList.colType') }}</label>
          <el-input :model-value="storageLabel" disabled />
        </div>
        <div class="config__row">
          <label class="config__label">{{ t('form.maxLength') }}</label>
          <el-input-number
            :model-value="field.field.length"
            :min="1"
            :controls="true"
            :placeholder="t('form.unlimited')"
            @update:model-value="(v: number | undefined) => emit('update', { length: v })"
          />
        </div>
      </div>
      <div v-else class="config__row">
        <label class="config__label">{{ t('fieldList.colType') }}</label>
        <el-input :model-value="storageLabel" disabled />
      </div>

      <!-- 类型专属配置（注册表动态挂载；已发布只读时不出可编辑面板） -->
      <component
        :is="descriptor.configComponent"
        v-if="descriptor?.configComponent && !readonly"
        :field="field.field"
        :other-names="otherNames"
        :hide-length="field.field.type === 'TEXT'"
        :subfield="subfield"
        @update="(p: FieldPatch) => emit('update', p)"
      />
      <p v-else-if="!readonly" class="config__placeholder">
        「{{ descriptor?.label ?? t('form.thisField') }}」配置项待接入（后续刀）
      </p>

      <!-- BF20261013-021：高级编辑（脚本）——值变更时执行的字段脚本（已发布只读不回显可编辑面板） -->
      <ScriptConfig
        v-if="field.field.type !== 'LABEL'"
        :field="field.field"
        @update="(p: FieldPatch) => emit('update', p)"
      />

      <p class="config__note">
        {{ keyLocked ? t('form.fieldKeyLockedNote') : t('form.fieldKeySuffixHint') }}
      </p>

      <!-- ═══ 其他信息 ═══ -->
      <h3 class="config__section">{{ t('form.sectionOtherInfo') }}</h3>
      <div class="config__extension">
        <p class="config__extension-title">{{ t('form.extensionAreaTitle') }}</p>
        <p class="config__extension-hint">{{ t('form.extensionAreaHint') }}</p>
      </div>

      <!-- v0.0.2 P2：显隐联动规则（LABEL 非输入字段也可控显隐）；置于其他信息之后 -->
      <RulesEditor
        :target="field.field.name"
        :field-names="ruleFieldNames"
        :rule="rule"
        @update-rule="(r) => emit('update-rule', r)"
      />
    </template>
  </aside>
</template>

<style scoped>
.config {
  width: 280px;
  flex: 0 0 280px;
  border-left: 1px solid var(--sw-border-light);
  padding: 18px 16px 16px;
  overflow-y: auto;
  /* 设计 07：面板输入框 36px 高（文本在框内与设计同位）；文本行盒 17px */
  --el-input-height: 36px;
}

/* V011-BUG-013：恢复输入框常规内边距——文本不再贴边/被裁切（此前 padding 被清零） */
.config :deep(.el-input__inner) {
  line-height: 17px;
}

.config :deep(.el-input__wrapper) {
  padding: 1px 11px;
}

/* P53 节点07：头部标题 + 右侧类型徽标 */
.config__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 8px;
}

.config__title {
  margin: 0;
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-h2);
  color: var(--sw-text-primary);
}

.config__hint {
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-body);
}

/* 三段结构小节标题（设计07：基础信息 194 / 高级信息 522） */
.config__section {
  margin: 25px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eceff7;
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}

/* 设计07：首段（基础信息）紧随面板头部 */
.config__section:first-of-type {
  margin-top: 19px;
}

.config__row {
  margin-bottom: 25px;
}

/* 设计07：输入框/选择器文本行盒 17px（与设计文本盒同高） */
.config__row :deep(.el-input__inner),
.config__row :deep(.el-select__selected-item),
.config__row :deep(.el-select__placeholder) {
  line-height: 17px;
}

.config__row--inline {
  margin-top: -6px;
  margin-bottom: 13px;
}

.config__type-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px 24px;
}

.config__type-pair .config__row {
  min-width: 0;
}

.config__type-pair :deep(.el-input-number) {
  width: 100%;
}

.config__row--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-8);
}

.config__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  color: var(--sw-text-regular);
}

.config__row--inline .config__label {
  margin-bottom: 0;
}

.config__row :deep(.el-select),
.config__row :deep(.el-input-number) {
  width: 100%;
}

/* BF20261013-016：宽度选项 = 宽度示意图（左）+ 百分比（右） */
.width-option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.width-option__gauge {
  box-sizing: border-box;
  width: 56px;
  height: 14px;
  padding: 2px;
  border: 1px solid var(--sw-border-base, #ccd5e5);
  border-radius: 3px;
  background: var(--sw-fill-base, #f4f6fb);
}

.width-option__gauge i {
  display: block;
  height: 100%;
  border-radius: 1px;
  background: var(--sw-color-primary);
}

.width-option__pct {
  font-size: var(--sw-font-emphasis, 13px);
  color: var(--sw-text-regular, #303a55);
}

.config__note {
  margin: var(--sw-space-8) 0 33px;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}

/* BF20261013-007：类型徽标不换行、无底色；超长省略号兜底（不再固定宽度导致折行） */
.config__type {
  box-sizing: border-box;
  max-width: 70%;
  padding: 4.5px 0;
  height: 24px;
  line-height: 15px;
  font-size: var(--sw-font-caption);
  text-align: left;
  color: var(--sw-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.config__name {
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
  font-family: var(--el-font-family-mono, monospace);
}

.config__readonly-hint {
  padding: var(--sw-space-16);
  border: 1px dashed var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
  text-align: center;
}

.config__placeholder {
  padding: var(--sw-space-16);
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-placeholder);
  font-size: var(--sw-font-secondary);
  text-align: center;
}

/* 其他信息：扩展属性预留区 */
.config__extension {
  padding: 25px 16px 12px;
  border: 1px solid #e3e8f4;
  border-radius: 8px;
  background: #f7f9fe;
}

.config__extension-title {
  margin: 0 0 4px;
  font-size: var(--sw-font-emphasis);
  color: var(--sw-text-regular);
}

.config__extension-hint {
  margin: 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-secondary);
}
</style>
