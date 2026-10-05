<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * 日期（DATE）配置面板。
 * 契约键：label / name / required / format（P63）。
 * P63：日期格式放开为「日期 / 日期时间」二值开关——开启写 definition format="datetime"
 * （值 YYYY-MM-DD HH:mm:ss），关闭写 undefined（缺省 date，值 YYYY-MM-DD）。
 * 子表子字段上下文（subfield=true）不展示该开关：服务端 subFields 契约未落 format 键。
 * 默认值无契约键 → seam（禁自造键）。
 */
import type { DateField } from '@/contracts/form-schema'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = withDefaults(
  defineProps<{
    field: DateField
    otherNames: string[]
    /** 子表子字段上下文（子画布复用本面板）：隐藏 format 开关（服务端 subFields 无该契约键）。 */
    subfield?: boolean
  }>(),
  { subfield: false },
)
const emit = defineEmits<{ update: [patch: FieldPatch] }>()

/** 日期时间格式的值形态（格式字面量，语言无关，直接展示不进 locale）。 */
const DATETIME_FORMAT_EXAMPLE = 'YYYY-MM-DD HH:mm:ss'

/** 当前是否为日期时间格式（缺省 date）。 */
const isDatetime = computed(() => props.field.format === 'datetime')

/** 开 → 写 'datetime'；关 → 写 undefined（JSON 序列化丢键，保持缺省形状干净）。 */
function onFormatSwitch(value: string | number | boolean) {
  emit('update', { format: value ? 'datetime' : undefined })
}
</script>

<template>
  <div>
    <CommonConfigRows
      :label="props.field.label ?? ''"
      :name="props.field.name"
      :required="props.field.required ?? false"
      :other-names="props.otherNames"
      @update="(p) => emit('update', p)"
    />

    <!-- P63：日期 / 日期时间二值开关（仅主表字段；子字段契约无 format 键，不展示） -->
    <div v-if="!subfield" class="row">
      <label class="row__label">{{ t('form.dateFormat') }}</label>
      <div class="row row--inline">
        <span class="row__mode">{{ t('form.paletteDateTime') }}</span>
        <!-- data-testid 区分于 CommonConfigRows 的必填开关（本面板同时存在两枚 el-switch） -->
        <el-switch
          data-testid="date-format-switch"
          :model-value="isDatetime"
          @update:model-value="onFormatSwitch"
        />
      </div>
      <p class="row__hint">
        {{ isDatetime ? DATETIME_FORMAT_EXAMPLE : t('form.dateFormatExample') }}
      </p>
    </div>

    <ConfigSeamNote :items="[t('form.defaultValue')]" />
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}

.row--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0;
}

.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.row__mode {
  font-size: var(--sw-font-emphasis);
  color: var(--sw-text-regular);
}

.row__hint {
  margin: var(--sw-space-4) 0 0;
  font-size: var(--sw-font-caption);
  color: var(--sw-text-placeholder);
}
</style>
