<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ThemeRuleDialog — 流程编号（主题）规则设置弹窗。
 *
 * 0.1.7 #37（Owner）：按同类产品改为**要素编排器**——模拟编号实时预览、上方要素按钮、
 * 中间要素条（逐要素可选中/删除/前后移动/清空）、下方按选中要素配置（常量文字、日期/时间格式、
 * 流水号长度、发起人、自定义表达式）；「自定义」要素是受控表达式要素（只读变量、不执行脚本）。
 * 规则文本仍是唯一真源：parseThemeElements ↔ serializeThemeElements 往返，保存前不落库。
 * 供流程定义列表与表单工作台「关联流程」共用。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { ApiError } from '@/foundation/request'
import { getProcessDefThemeRule, updateProcessDefThemeRule } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import {
  SEQ_DIGIT_OPTIONS,
  THEME_DATE_FORMATS,
  THEME_ELEMENT_DEFAULT_RAW,
  THEME_EXPRESSION_VARIABLES,
  THEME_TIME_FORMATS,
  datePatternOf,
  expressionOf,
  parseThemeElements,
  seqDigitsOf,
  seqToken,
  serializeThemeElements,
  themeElementError,
  themeRulePreview,
} from '@/modules/workflow/utils/theme-rule'
import type {
  ThemeElement,
  ThemeElementError,
  ThemeElementKind,
} from '@/modules/workflow/utils/theme-rule'

const props = defineProps<{ visible: boolean; def: ProcessDef | null }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const userStore = useUserStore()

/** 要素按钮顺序（与参考产品一致：日期 / 时间 / 流水号 / 常量 / 发起人 / 自定义）。 */
const ELEMENT_BUTTONS: ThemeElementKind[] = ['date', 'time', 'seq', 'text', 'initiator', 'custom']

/** 要素类型 → 文案键。 */
const ELEMENT_LABEL_KEY: Record<ThemeElementKind, string> = {
  text: 'workflow.themeRuleElementText',
  date: 'workflow.themeRuleElementDate',
  time: 'workflow.themeRuleElementTime',
  seq: 'workflow.themeRuleElementSeq',
  initiator: 'workflow.themeRuleElementInitiator',
  custom: 'workflow.themeRuleElementCustom',
  legacy: 'workflow.themeRuleElementLegacy',
}

const elements = ref<ThemeElement[]>([])
const activeIndex = ref(0)
const saving = ref(false)

const sampleNow = new Date()
const sampleInitiator = computed(() => userStore.user?.displayName ?? '')

const ruleText = computed(() => serializeThemeElements(elements.value))
const preview = computed(() => themeRulePreview(ruleText.value, sampleNow, sampleInitiator.value))
const activeElement = computed<ThemeElement | null>(() => elements.value[activeIndex.value] ?? null)

/** 要素级问题（与参考产品同形：要素条上标错 + 顶部汇总「存在 N 个错误」，有错时不许保存）。 */
const elementErrors = computed<(ThemeElementError | null)[]>(() =>
  elements.value.map((element) => themeElementError(element)),
)
const errorCount = computed(() => elementErrors.value.filter(Boolean).length)

const ELEMENT_ERROR_KEY: Record<ThemeElementError, string> = {
  emptyText: 'workflow.themeRuleErrorEmptyText',
  emptyExpression: 'workflow.themeRuleErrorEmptyExpression',
  unbalancedParens: 'workflow.themeRuleErrorUnbalancedParens',
}

function elementErrorText(element: ThemeElement): string {
  const error = themeElementError(element)
  return error ? t(ELEMENT_ERROR_KEY[error]) : ''
}

/** 要素条上的取值（演示值）：与模拟编号同一口径。 */
function elementValue(element: ThemeElement): string {
  return themeRulePreview(element.raw, sampleNow, sampleInitiator.value)
}

function elementLabel(element: ThemeElement): string {
  return t(ELEMENT_LABEL_KEY[element.kind])
}

/* ── 要素增删改与排序 ── */

function addElement(kind: ThemeElementKind) {
  if (kind === 'legacy') return
  const raw = kind === 'text' ? '' : THEME_ELEMENT_DEFAULT_RAW[kind]
  elements.value.push({ id: `el-${Date.now()}-${elements.value.length}`, kind, raw })
  activeIndex.value = elements.value.length - 1
}

function removeElement(index: number) {
  elements.value.splice(index, 1)
  activeIndex.value = Math.max(0, Math.min(activeIndex.value, elements.value.length - 1))
}

function clearAll() {
  elements.value = []
  activeIndex.value = 0
}

function moveElement(delta: number) {
  const from = activeIndex.value
  const to = from + delta
  if (to < 0 || to >= elements.value.length) return
  const next = [...elements.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  elements.value = next
  activeIndex.value = to
}

function patchRaw(raw: string) {
  const current = activeElement.value
  if (!current) return
  elements.value[activeIndex.value] = { ...current, raw }
}

function patchDateFormat(pattern: string) {
  patchRaw(`{DATE:${pattern}}`)
}

function patchTimeFormat(pattern: string) {
  patchRaw(`{TIME:${pattern}}`)
}

function patchSeqDigits(digits: number) {
  patchRaw(seqToken(digits))
}

function patchExpression(expression: string) {
  patchRaw(`{EXPR:${expression}}`)
}

/** 点变量在表达式末尾追加（表达式只读变量，不执行脚本）；已在表达式里的变量不重复叠加。 */
function appendExpressionVariable(name: string) {
  const current = expressionOf(activeElement.value?.raw ?? '') ?? ''
  if (current.split(/\s+/).includes(name)) return
  patchExpression(current ? `${current} ${name}` : name)
}

/** 位数下拉选项：既有规则可能是 7-10 位（服务端上限 10），动态并入以免回显丢失。 */
const seqDigitChoices = computed(() => {
  const base = SEQ_DIGIT_OPTIONS.map(Number)
  const current = seqDigitsOf(activeElement.value?.raw ?? '')
  if (current === null || base.includes(current)) return base
  return [...base, current].sort((a, b) => a - b)
})

/** 自定义要素变量：可点击追加（与后端 expressionVariables 同名）。 */
const expressionVariables = THEME_EXPRESSION_VARIABLES
const dateFormats = THEME_DATE_FORMATS
const timeFormats = THEME_TIME_FORMATS

/* ── 打开回显 / 保存 ── */

async function loadThemeRule() {
  if (!props.def) return
  elements.value = []
  activeIndex.value = 0
  try {
    const rule = await getProcessDefThemeRule(props.def.id)
    elements.value = parseThemeElements(rule ?? '')
  } catch {
    // 读取失败按空规则处理：用户仍可重新设置，保存时服务端校验兜底
    elements.value = []
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadThemeRule()
  },
  { immediate: true },
)

function close() {
  emit('update:visible', false)
}

async function saveThemeRule() {
  if (!props.def) return
  const rule = ruleText.value.trim()
  if (!rule) {
    ElMessage.warning(t('workflow.themeRuleRequired'))
    return
  }
  saving.value = true
  try {
    await updateProcessDefThemeRule(props.def.id, rule)
    ElMessage.success(t('workflow.themeRuleSaved'))
    emit('saved')
    close()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.themeRuleSaveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="t('workflow.themeRuleTitle')"
    width="720px"
    append-to-body
    @update:model-value="emit('update:visible', $event)"
  >
    <p v-if="def" class="theme-dialog__meta">{{ def.name }}（{{ def.processKey }}）</p>

    <!-- 模拟编号：实时展示当前要素编排出的编号长相 -->
    <p class="theme-dialog__preview" data-testid="theme-preview">
      <span class="theme-dialog__preview-label">{{ t('workflow.themeRulePreview') }}</span>
      <strong class="theme-dialog__preview-value">{{ preview || '—' }}</strong>
    </p>

    <!-- 要素按钮：点击即在要素条追加 -->
    <div class="theme-dialog__palette" role="group" :aria-label="t('workflow.themeRuleElements')">
      <button
        v-for="kind in ELEMENT_BUTTONS"
        :key="kind"
        type="button"
        class="theme-dialog__palette-item"
        :data-testid="'theme-element-add-' + kind"
        @click="addElement(kind)"
      >
        {{ t(ELEMENT_LABEL_KEY[kind]) }}
      </button>
      <button
        type="button"
        class="theme-dialog__clear"
        data-testid="theme-clear"
        :disabled="elements.length === 0"
        @click="clearAll"
      >
        {{ t('workflow.themeRuleClear') }}
      </button>
    </div>

    <!-- 要素条：顺序即编号顺序；选中后下方配置 -->
    <div class="theme-dialog__strip" role="list">
      <p v-if="errorCount > 0" class="theme-dialog__error-banner" data-testid="theme-error-banner">
        {{ t('workflow.themeRuleErrorBanner', { n: errorCount }) }}
      </p>
      <button
        v-for="(element, index) in elements"
        :key="element.id"
        type="button"
        role="listitem"
        class="theme-dialog__chip"
        :class="{ 'is-active': index === activeIndex, 'is-invalid': Boolean(elementErrors[index]) }"
        data-testid="theme-element-chip"
        :data-kind="element.kind"
        :data-raw="element.raw"
        @click="activeIndex = index"
      >
        <span class="theme-dialog__chip-kind">{{ elementLabel(element) }}</span>
        <span class="theme-dialog__chip-value">{{ elementValue(element) || '—' }}</span>
        <span
          v-if="elementErrors[index]"
          class="theme-dialog__chip-error"
          data-testid="theme-element-error"
          :title="elementErrorText(element)"
          >!</span
        >
      </button>
      <p v-if="elements.length === 0" class="theme-dialog__strip-empty">
        {{ t('workflow.themeRuleEmptyStrip') }}
      </p>
    </div>

    <!-- 选中要素配置 -->
    <div v-if="activeElement" class="theme-dialog__config" data-testid="theme-element-config">
      <div class="theme-dialog__config-head">
        <span class="theme-dialog__config-title">{{ elementLabel(activeElement) }}</span>
        <span class="theme-dialog__config-actions">
          <el-button
            :disabled="activeIndex === 0"
            data-testid="theme-element-move-left"
            @click="moveElement(-1)"
            >←</el-button
          >
          <el-button
            :disabled="activeIndex === elements.length - 1"
            data-testid="theme-element-move-right"
            @click="moveElement(1)"
            >→</el-button
          >
          <el-button data-testid="theme-element-remove" @click="removeElement(activeIndex)">
            {{ t('workflow.themeRuleRemove') }}
          </el-button>
        </span>
      </div>

      <!-- 常量 -->
      <div v-if="activeElement.kind === 'text'" class="theme-dialog__field">
        <label class="theme-dialog__field-label">{{ t('workflow.themeRuleTextLabel') }}</label>
        <el-input
          :model-value="activeElement.raw"
          maxlength="60"
          data-testid="theme-element-text"
          :placeholder="t('workflow.themeRuleTextPlaceholder')"
          @update:model-value="(value: string) => patchRaw(value)"
        />
      </div>

      <!-- 日期 -->
      <div v-else-if="activeElement.kind === 'date'" class="theme-dialog__field">
        <label class="theme-dialog__field-label">{{ t('workflow.themeRuleDateFormat') }}</label>
        <el-select
          :model-value="datePatternOf(activeElement.raw) ?? ''"
          data-testid="theme-element-date-format"
          @update:model-value="(value: string) => patchDateFormat(value)"
        >
          <el-option
            v-for="pattern in dateFormats"
            :key="pattern"
            :value="pattern"
            :label="themeRulePreview(`{DATE:${pattern}}`, sampleNow)"
          />
        </el-select>
      </div>

      <!-- 时间 -->
      <div v-else-if="activeElement.kind === 'time'" class="theme-dialog__field">
        <label class="theme-dialog__field-label">{{ t('workflow.themeRuleTimeFormat') }}</label>
        <el-select
          :model-value="datePatternOf(activeElement.raw) ?? ''"
          data-testid="theme-element-time-format"
          @update:model-value="(value: string) => patchTimeFormat(value)"
        >
          <el-option
            v-for="pattern in timeFormats"
            :key="pattern"
            :value="pattern"
            :label="themeRulePreview(`{TIME:${pattern}}`, sampleNow)"
          />
        </el-select>
      </div>

      <!-- 流水号 -->
      <div v-else-if="activeElement.kind === 'seq'" class="theme-dialog__field">
        <label class="theme-dialog__field-label">{{ t('workflow.themeRuleSeqDigitsLabel') }}</label>
        <el-select
          :model-value="seqDigitsOf(activeElement.raw) ?? 0"
          data-testid="theme-element-seq-digits"
          @update:model-value="(value: number) => patchSeqDigits(value)"
        >
          <el-option
            v-for="digits in seqDigitChoices"
            :key="digits"
            :value="digits"
            :label="
              digits === 0
                ? t('workflow.themeRuleSeqNoPad')
                : t('workflow.themeRuleSeqDigits', { n: digits })
            "
          />
        </el-select>
        <p class="theme-dialog__field-hint">{{ t('workflow.themeRuleSeqHint') }}</p>
      </div>

      <!-- 发起人 -->
      <div v-else-if="activeElement.kind === 'initiator'" class="theme-dialog__field">
        <p class="theme-dialog__field-hint">{{ t('workflow.themeRuleInitiatorHint') }}</p>
      </div>

      <!-- 自定义（受控表达式；只读变量，不执行脚本） -->
      <div v-else-if="activeElement.kind === 'custom'" class="theme-dialog__field">
        <label class="theme-dialog__field-label">{{
          t('workflow.themeRuleExpressionLabel')
        }}</label>
        <el-input
          :model-value="expressionOf(activeElement.raw) ?? ''"
          maxlength="120"
          data-testid="theme-element-expression"
          :placeholder="t('workflow.themeRuleExpressionPlaceholder')"
          @update:model-value="(value: string) => patchExpression(value)"
        />
        <div class="theme-dialog__vars">
          <button
            v-for="name in expressionVariables"
            :key="name"
            type="button"
            class="theme-dialog__var"
            :data-testid="'theme-var-' + name"
            @click="appendExpressionVariable(name)"
          >
            {{ name }}
          </button>
        </div>
        <p class="theme-dialog__field-hint">{{ t('workflow.themeRuleExpressionHint') }}</p>
      </div>

      <!-- 历史记法（{TIMESTAMP} 等）：保留原样，删除后可改用新要素重建 -->
      <div v-else class="theme-dialog__field">
        <p class="theme-dialog__field-hint">{{ t('workflow.themeRuleLegacyHint') }}</p>
      </div>
    </div>

    <p class="theme-dialog__hint">{{ t('workflow.themeRuleRequiredHint') }}</p>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="errorCount > 0"
        data-testid="theme-save"
        @click="saveThemeRule"
        >{{ t('common.save') }}</el-button
      >
    </template>
  </el-dialog>
</template>

<style scoped>
.theme-dialog__meta {
  margin: 0 0 10px;
  color: #17213a;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
/* 模拟编号：编号长相一眼可见（0.1.7 #37） */
.theme-dialog__preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid #e3e8f4;
  border-radius: 8px;
  background: #f7f9fe;
  font-size: 13px;
}
.theme-dialog__preview-label {
  color: #8690ae;
}
.theme-dialog__preview-value {
  color: #17213a;
  font-size: 14px;
  letter-spacing: 0.2px;
}
.theme-dialog__palette {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.theme-dialog__palette-item,
.theme-dialog__clear {
  height: 32px;
  padding: 0 14px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #46506a;
  font-size: 13px;
  cursor: pointer;
}
.theme-dialog__palette-item:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.theme-dialog__clear {
  margin-left: auto;
  color: var(--el-color-primary);
}
.theme-dialog__clear:disabled {
  color: #a8abb2;
  cursor: not-allowed;
}
/* 要素条：每个要素 = 类型 + 演示值 */
.theme-dialog__strip {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px dashed #cfd7e6;
  border-radius: 8px;
  background: #fbfcff;
}
.theme-dialog__chip {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 72px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.theme-dialog__chip.is-active {
  border-color: #e3e8f4;
  border-bottom-color: var(--el-color-primary);
  background: #fff;
}
/* 要素有错：红框 + 右上角感叹号（与顶部「存在 N 个错误」同源） */
.theme-dialog__chip.is-invalid {
  border-color: #f56c6c;
}
.theme-dialog__chip-error {
  position: absolute;
  top: -6px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
}
.theme-dialog__error-banner {
  flex: 0 0 100%;
  margin: 0 0 2px;
  color: #f56c6c;
  font-size: 12px;
  line-height: 18px;
}
.theme-dialog__chip-kind {
  color: #46506a;
  font-size: 13px;
  line-height: 18px;
}
.theme-dialog__chip-value {
  color: var(--sw-color-primary);
  font-size: 12px;
  line-height: 16px;
}
.theme-dialog__strip-empty {
  margin: 0;
  align-self: center;
  color: #a8abb2;
  font-size: 12px;
}
.theme-dialog__config {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e3e8f4;
  border-radius: 8px;
  background: #fff;
}
.theme-dialog__config-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.theme-dialog__config-title {
  color: #17213a;
  font-size: 13px;
  font-weight: 600;
}
.theme-dialog__config-actions {
  display: flex;
  gap: 8px;
}
.theme-dialog__config-actions :deep(.el-button) {
  margin: 0;
}
.theme-dialog__field-label {
  display: block;
  margin-bottom: 4px;
  color: #8690ae;
  font-size: 12px;
  line-height: 17px;
}
.theme-dialog__field :deep(.el-select) {
  width: 100%;
}
.theme-dialog__field-hint {
  margin: 6px 0 0;
  color: #99a5bb;
  font-size: 12px;
  line-height: 17px;
}
.theme-dialog__vars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.theme-dialog__var {
  height: 24px;
  padding: 0 8px;
  border: 1px solid #e3e8f4;
  border-radius: 4px;
  background: #f7f9fe;
  color: #46506a;
  font-size: 12px;
  cursor: pointer;
}
.theme-dialog__var:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.theme-dialog__hint {
  margin: 10px 0 0;
  color: #99a5bb;
  font-size: 12px;
  line-height: 17px;
}
</style>
