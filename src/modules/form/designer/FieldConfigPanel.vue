<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 配置面板（设计器右栏）—— 宿主只按注册表动态挂载，禁写死类型 switch。
 *
 * 0.2.0 执行提示12（G07/G36）按当前蓝色原稿分区：
 *  - 文字（LABEL）选中态：专用排列先行——文字内容/对齐三段/字号+字重同排/颜色/宽度；
 *    通用元数据收进可展开的高级入口（内距 20，右栏 336 从 x1584）；
 *  - 其余组件：基础信息 / 高级信息两段，值变更（JS）与显示条件（设置）并入高级信息末尾；
 *    原第三段「其他信息」扩展占位随原稿移除（0.1.7 #36 的紧凑占位结构一并退场）。
 *
 * 配置面板改动经 @update 抛 FieldPatch，本宿主原样上交给设计器写回选中字段（单一数据源）。
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { getFieldTypeDescriptor } from './field-types'
import { isColumnNameUnique } from './column-name'
import type { DesignerItem } from './types'
import type { FieldPatch } from './field-config'
import RulesEditor from './config/RulesEditor.vue'
import ScriptConfig from './ScriptConfig.vue'
import FieldValidationDialog from './FieldValidationDialog.vue'
import { WIDTH_COL_STEPS, widthStepPercent } from './width-steps'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'
import {
  DEFAULT_FIELD_LABEL_POSITION,
  DEFAULT_FIELD_TEXT_ALIGN,
  type FieldLabelPosition,
  type FieldTextAlign,
  type LabelField,
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

/** 字段校验规则独立弹窗（273:1845）：入口在高级信息，确认才回写。 */
const validationVisible = ref(false)

function applyValidation(patch: FieldPatch) {
  emit('update', patch)
}

const descriptor = computed(() =>
  props.field ? getFieldTypeDescriptor(props.field.field.type) : undefined,
)

const isLabel = computed(() => props.field?.field.type === 'LABEL')

/** 文字专用面板的高级入口（490:16184）：默认收起，展开后为通用元数据。 */
const labelAdvancedOpen = ref(false)

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

/* ── 文字（LABEL）专用排列（490:16184） ── */

const DEFAULT_LABEL_FONT_SIZE = 14
/**
 * 字号选项（490:16919）：首屏六项常用档 14/16/18/20/24/28 各 36 行；
 * 既有 12/32/36/48 保留在后续滚动区，历史自定义字号追加末尾不丢显。
 */
const LABEL_FONT_SIZE_STEPS = [14, 16, 18, 20, 24, 28, 12, 32, 36, 48]

function labelText(): string {
  return ((props.field?.field as LabelField | undefined)?.text ?? '') as string
}

function onLabelText(value: string) {
  emit('update', { text: value })
}

function labelColor(): string {
  return ((props.field?.field as LabelField | undefined)?.color ?? '') as string
}

function onLabelColor(value: string | null) {
  emit('update', { color: value ?? '' })
}

function labelFontSize(): number {
  const size = (props.field?.field as LabelField | undefined)?.fontSize
  return typeof size === 'number' && size > 0 ? size : DEFAULT_LABEL_FONT_SIZE
}

const labelFontSizeOptions = computed(() => {
  const current = labelFontSize()
  return LABEL_FONT_SIZE_STEPS.includes(current)
    ? LABEL_FONT_SIZE_STEPS
    : [...LABEL_FONT_SIZE_STEPS, current]
})

function onLabelFontSize(value: number | undefined) {
  emit('update', { fontSize: value ?? undefined })
}

function labelFontWeight(): 'normal' | 'bold' {
  return ((props.field?.field as LabelField | undefined)?.fontWeight ?? 'normal') as
    | 'normal'
    | 'bold'
}

function onLabelFontWeight() {
  emit('update', { fontWeight: labelFontWeight() === 'bold' ? 'normal' : 'bold' })
}

function labelTextAlign(): FieldTextAlign {
  return ((props.field?.field as LabelField | undefined)?.textAlign ??
    DEFAULT_FIELD_TEXT_ALIGN) as FieldTextAlign
}

function onLabelTextAlign(value: string | number | boolean | undefined) {
  const align: FieldTextAlign =
    value === 'center' || value === 'right' ? value : DEFAULT_FIELD_TEXT_ALIGN
  emit('update', { textAlign: align })
}

/**
 * 数据类型展示（2026-10-27 方向）：面向配置者显示逻辑类型名，复用控件元信息；
 * 单行文本显示「文本」。VARCHAR/JSON 等存储族只属实现细节，不在该行暴露。
 */
const logicalTypeLabel = computed(() => {
  if (!props.field) return ''
  if (props.field.field.type === 'TEXT') return t('form.fieldDataTypeText')
  return descriptor.value?.label ?? props.field.field.type
})

/** 右上控件名：多行 TEXT 显示「多行文本」，避免仍标成单行文本。 */
const controlLabel = computed(() => {
  if (!props.field) return ''
  if (
    props.field.field.type === 'TEXT' &&
    (props.field.field as { multiline?: boolean }).multiline
  ) {
    return t('form.paletteMultiline')
  }
  return descriptor.value?.label ?? props.field.field.type
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
  <aside class="config" :class="{ 'config--label': field !== null && isLabel }">
    <div class="config__head">
      <h2 class="config__title">{{ t('form.fieldSettingsTitle') }}</h2>
      <span v-if="field" class="config__type">{{ controlLabel }}</span>
    </div>

    <div v-if="!field" class="config__empty" />

    <!-- ═══ 文字（LABEL）专用排列（490:16184）：内容→对齐→字号/字重→颜色→宽度 ═══ -->
    <template v-else-if="isLabel">
      <div class="config__row">
        <label class="config__label">{{ t('form.labelBody') }}</label>
        <el-input
          :model-value="labelText()"
          type="textarea"
          :rows="3"
          :placeholder="t('form.labelBodyPlaceholder')"
          :disabled="readonly"
          @update:model-value="onLabelText"
        />
      </div>

      <div class="config__row">
        <label class="config__label">{{ t('form.labelAlignLabel') }}</label>
        <el-radio-group
          :model-value="labelTextAlign()"
          class="config__align"
          :disabled="readonly"
          @update:model-value="onLabelTextAlign"
        >
          <el-radio-button value="left">{{ t('form.textAlignLeft') }}</el-radio-button>
          <el-radio-button value="center">{{ t('form.textAlignCenter') }}</el-radio-button>
          <el-radio-button value="right">{{ t('form.textAlignRight') }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="config__cols">
        <div class="config__row">
          <label class="config__label">{{ t('form.labelFontSize') }}</label>
          <el-select
            popper-class="label-font-size-popper"
            :model-value="labelFontSize()"
            :disabled="readonly"
            @update:model-value="onLabelFontSize"
          >
            <el-option v-for="size in labelFontSizeOptions" :key="size" :value="size">
              {{ size }} px
            </el-option>
          </el-select>
        </div>
        <div class="config__row">
          <label class="config__label">{{ t('form.labelWeightLabel') }}</label>
          <el-button
            class="config__weight"
            :class="{ 'is-on': labelFontWeight() === 'bold' }"
            :disabled="readonly"
            @click="onLabelFontWeight"
          >
            {{
              labelFontWeight() === 'bold' ? t('form.fontWeightBold') : t('form.fontWeightNormal')
            }}
          </el-button>
        </div>
      </div>

      <div class="config__row">
        <label class="config__label">{{ t('form.labelColorLabel') }}</label>
        <div class="config__color">
          <span
            class="config__color-swatch"
            :style="{ background: labelColor() || 'transparent' }"
          />
          <span class="config__color-hex">{{ labelColor() || '—' }}</span>
          <el-icon class="config__color-arrow"><ArrowDown /></el-icon>
          <el-color-picker
            class="config__color-picker"
            popper-class="label-color-popover"
            :model-value="labelColor()"
            :predefine="[
              '#172033',
              '#303a55',
              '#6b7280',
              '#6f2dff',
              '#d93026',
              '#1f9d55',
              '#2563eb',
              '#d97706',
            ]"
            :disabled="readonly"
            @update:model-value="onLabelColor"
          />
        </div>
      </div>

      <div class="config__row">
        <label class="config__label">{{ t('form.widthLabel') }}</label>
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

      <!-- 通用元数据高级入口：默认收起，展开为组件名称/字段标识/数据类型/显示条件 -->
      <h3
        class="config__section config__section--toggle"
        data-testid="label-advanced-toggle"
        @click="labelAdvancedOpen = !labelAdvancedOpen"
      >
        {{ t('form.sectionAdvancedInfo') }}
        <el-icon class="config__section-caret" :class="{ 'is-open': labelAdvancedOpen }">
          <ArrowDown />
        </el-icon>
      </h3>
      <template v-if="labelAdvancedOpen">
        <div class="config__row">
          <label class="config__label">{{ t('fieldList.colName') }}</label>
          <el-input
            :model-value="field.field.label ?? ''"
            :disabled="readonly"
            @update:model-value="(v: string) => emit('update', { label: v })"
          />
        </div>
        <div class="config__row">
          <label class="config__label">{{ t('form.fieldKeyLabel') }}</label>
          <el-input
            :model-value="fieldKeySuffix"
            :disabled="keyLocked"
            :maxlength="58"
            @update:model-value="onFieldKeySuffix"
          >
            <template #prepend>field_</template>
          </el-input>
        </div>
        <div class="config__row">
          <label class="config__label">{{ t('fieldList.colType') }}</label>
          <el-input :model-value="logicalTypeLabel" disabled />
        </div>
        <RulesEditor
          :target="field.field.name"
          :field-names="ruleFieldNames"
          :rule="rule"
          @update-rule="(r) => emit('update-rule', r)"
        />
      </template>
    </template>

    <!-- ═══ 其余组件：基础信息 / 高级信息（值变更、显示条件并入高级信息） ═══ -->
    <template v-else>
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
      <div class="config__row">
        <label class="config__label">{{ t('fieldList.colType') }}</label>
        <el-input :model-value="logicalTypeLabel" disabled />
      </div>
      <!-- 字段校验规则收进独立弹窗（273:1845）：面板只保留入口，确认才回写 -->
      <div
        v-if="field.field.type === 'TEXT' || field.field.type === 'RICH_TEXT'"
        class="config__row config__row--inline"
      >
        <label class="config__label">{{ t('form.fieldValidation') }}</label>
        <el-button
          size="small"
          data-testid="open-field-validation"
          :disabled="readonly"
          @click="validationVisible = true"
        >
          {{ t('common.configure') }}
        </el-button>
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
        {{ t('form.unsupportedConfig') }}
      </p>

      <!-- BF20261013-021：值变更（JS）——字段脚本，与显示条件同为高级信息行（490 原稿排列） -->
      <ScriptConfig
        v-if="field.field.type !== 'LABEL'"
        :field="field.field"
        @update="(p: FieldPatch) => emit('update', p)"
      />

      <!-- 显隐联动规则：显示条件行 + 展开编辑 -->
      <RulesEditor
        :target="field.field.name"
        :field-names="ruleFieldNames"
        :rule="rule"
        @update-rule="(r) => emit('update-rule', r)"
      />
    </template>

    <FieldValidationDialog
      v-if="field"
      v-model="validationVisible"
      :field="field"
      :readonly="readonly"
      @confirm="applyValidation"
    />
  </aside>
</template>

<style scoped>
.config {
  width: 280px;
  flex: 0 0 280px;
  border-left: 1px solid var(--sw-border-light);
  padding: 18px 16px 16px;
  overflow-y: auto;
  /* 0.1.7 #36（Owner）：面板内选择/填写框统一尺寸口径——高度 32px（含曾用 small 的控件）、
     宽度占满面板主体（.config__row 满宽）；文本行盒 17px */
  --el-component-size: 32px;
  --el-component-size-small: 32px;
}

/* G36（490:16184）：文字专用面板内距 20（右栏 336 从 x1584 由宿主承担）；
   13 收口：六控件可见框 内容(0,208,296,80)/对齐(0,336,296,36)/字号(0,420,140,32)/
   字重(1760,420,140,32)/颜色(0,500,296,32)/宽度(0,580,296,32)，默认边框 #DDE3EF，标签 14/22。 */
aside.config.config--label {
  padding: 20px;
  --el-border-color: #dde3ef;
  --el-input-border-color: #dde3ef;
}

aside.config.config--label .config__head {
  margin-bottom: 12px;
}

aside.config.config--label .config__row {
  margin-bottom: 0;
}

aside.config.config--label .config__row + .config__row,
aside.config.config--label .config__row + .config__cols,
aside.config.config--label .config__cols + .config__row {
  margin-top: 20px;
}

/* 字号/字重两列内部的相邻行不参与纵向节奏（否则字重列下坠 20px 并抬高后续行） */
aside.config.config--label .config__cols .config__row + .config__row {
  margin-top: 0;
}

aside.config.config--label .config__label {
  margin-bottom: 6px;
  line-height: 22px;
}

aside.config.config--label :deep(.el-textarea__inner) {
  box-sizing: border-box;
  min-height: 80px;
  height: 80px;
  border: 1px solid #dde3ef;
}

aside.config.config--label :deep(.config__align .el-radio-button__inner) {
  height: 36px;
  line-height: 34px;
}

aside.config.config--label .config__cols {
  column-gap: 16px;
}

aside.config.config--label .config__cols .el-button {
  width: 100%;
}

aside.config.config--label :deep(.el-input__wrapper),
aside.config.config--label :deep(.el-select__wrapper) {
  min-height: 32px;
  height: 32px;
}

aside.config.config--label .config__color {
  box-sizing: border-box;
  height: 32px;
}

aside.config.config--label .config__color-picker :deep(.el-color-picker__trigger) {
  height: 30px;
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

/* 三段结构小节标题 */
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

/* 高级入口（文字专用面板）：可点击展开 */
.config__section--toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.config__section-caret {
  font-size: 12px;
  color: var(--sw-text-secondary);
  transition: transform 0.15s;
}

.config__section-caret.is-open {
  transform: rotate(180deg);
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

/* G36：字号/字重同排两列 */
.config__cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 20px;
}

/* G36：三段对齐按钮铺满 */
.config__align {
  display: flex;
  width: 100%;
}

.config__align :deep(.el-radio-button) {
  flex: 1 1 0;
}

.config__align :deep(.el-radio-button__inner) {
  width: 100%;
}

/* G36：字重按钮（常规/加粗切换；选中蓝描边） */
.config__weight.is-on {
  color: var(--sw-color-primary);
  border-color: var(--sw-color-primary);
}

/* G36：颜色行 = 白底选择框（色块+HEX+箭头），点击任意处由透明取色器承接面板 */
.config__color {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.config__color-swatch {
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border: 1px solid rgb(0 0 0 / 10%);
  border-radius: 2px;
}

.config__color-hex {
  flex: 1 1 auto;
  font-size: 13px;
  line-height: 17px;
  color: var(--sw-text-regular);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.config__color-arrow {
  flex: 0 0 auto;
  font-size: 12px;
  color: #a8abb2;
}

/* 透明取色器铺满整行：点按任意处即弹出原取色面板 */
.config__color-picker {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
}

.config__color-picker :deep(.el-color-picker__trigger) {
  width: 100%;
  height: 100%;
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
</style>

<style>
/* Q52（490:16919）：静态文字字号浮层 140×228，首屏 6 行×36（14/16/18/20/24/28），
   其余既有档位在滚动区可访问。弹层 teleport 到 body，用专属 popper-class 限定作用域。 */
.label-font-size-popper {
  box-sizing: border-box;
  width: 140px;
  height: 228px;
}
.label-font-size-popper .el-select-dropdown {
  box-sizing: border-box;
  height: 226px;
  max-height: none;
  padding: 5px 0;
  overflow: hidden;
}
.label-font-size-popper .el-scrollbar__wrap {
  height: 216px;
  max-height: none;
  overflow-y: auto;
}
.label-font-size-popper .el-select-dropdown__list {
  max-height: none;
  padding: 0;
}
.label-font-size-popper .el-select-dropdown__item {
  box-sizing: border-box;
  height: 36px;
  line-height: 36px;
  padding: 0 13px;
  font-weight: 400;
}
.label-font-size-popper .el-select-dropdown__item.is-hovering,
.label-font-size-popper .el-select-dropdown__item:hover {
  background-color: #eff6ff;
}
.label-font-size-popper .el-select-dropdown__item.is-selected {
  color: var(--sw-color-primary, #2563eb);
  background-color: #eff6ff;
  font-weight: 400;
}

/* Q52（490:16934）：静态文字颜色浮层 430×286，保留原渐变/色相/HEX/预设与清空确认。
   面板内容 404×260：饱和度面 384×196，色相条同高；底部原 HEX 输入与清空/确定不变。 */
.label-color-popover.el-color-picker__panel {
  box-sizing: border-box;
  width: 430px;
  height: 286px;
}
.label-color-popover .el-color-picker-panel {
  box-sizing: content-box;
  width: 404px;
  height: 260px;
  padding: 12px;
}
.label-color-popover .el-color-svpanel {
  width: 384px;
  height: 196px;
}
.label-color-popover .el-color-hue-slider.is-vertical {
  height: 196px;
}
.label-color-popover .el-color-predefine {
  width: 384px;
}
.label-color-popover .el-color-picker-panel__footer .el-input {
  width: 280px;
}
</style>
