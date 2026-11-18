<script setup lang="ts">
import { useI18n } from '@/locales'
import type { FormSchema } from '@/contracts/form-schema'
import FormPreview from '@/adapters/form-designer/FormPreview.vue'
import { getFormFieldColSpan } from '@/modules/form/utils/form-layout'
import type { FrozenFieldPropRow } from './use-snapshot-field-props'

/**
 * 表单设计页签：左组件列 252 / 冻结表单画布 / 右冻结类型属性 336。
 * 点选字段由宿主承接（select-field），右栏「查看」入口经 open-detail 冒泡。
 */
defineProps<{
  schema: FormSchema | null
  selectedField: FormSchema['fields'][number] | null
  frozenFieldPropRows: FrozenFieldPropRow[]
  fieldScriptOf: (name: string) => string
}>()

const emit = defineEmits<{
  'select-field': [name: string]
  'open-detail': [row: FrozenFieldPropRow]
}>()

const { t } = useI18n()
</script>

<template>
  <!-- ═══ 表单设计：左组件列 252 / 冻结表单画布 / 右冻结类型属性 336 ═══ -->
  <div class="snapshot-tabbody snapshot-tabbody--design">
    <aside class="snapshot-side snapshot-side--fields">
      <h4>{{ t('form.snapshotViewer.componentList') }}</h4>
      <ul class="snapshot-component-list">
        <li v-for="field in schema?.fields ?? []" :key="field.name">
          <button
            type="button"
            :class="{ 'is-active': field.name === selectedField?.name }"
            @click="emit('select-field', field.name)"
          >
            {{ field.label || field.name }}
          </button>
        </li>
      </ul>
    </aside>
    <div class="snapshot-tabbody__main">
      <section class="snapshot-section">
        <p v-if="!schema || schema.fields.length === 0" class="snapshot-empty">
          {{ t('form.snapshotViewer.noData') }}
        </p>
        <div v-else class="snapshot-design">
          <p v-if="schema.description" class="snapshot-design__description">
            {{ schema.description }}
          </p>
          <div class="snapshot-design__grid">
            <div
              v-for="field in schema.fields"
              :key="field.name"
              :class="{
                'snapshot-design__cell': true,
                'is-selected': field.name === selectedField?.name,
              }"
              :style="{ gridColumn: `span ${getFormFieldColSpan(field)}` }"
              @click="emit('select-field', field.name)"
            >
              <FormPreview :schema="{ title: '', fields: [field] }" mode="design" />
            </div>
          </div>
        </div>
      </section>
    </div>
    <aside class="snapshot-side snapshot-side--props snapshot-side--props-surface">
      <h4>{{ t('form.snapshotViewer.propsTitle') }}</h4>
      <template v-if="selectedField">
        <div class="snapshot-props-surface">
          <div
            v-for="row in frozenFieldPropRows.slice(0, 5)"
            :key="row.label"
            class="snapshot-props-surface__group"
          >
            <label class="snapshot-props-surface__label">{{ row.label }}</label>
            <input class="snapshot-props-surface__input" :value="row.value" readonly />
          </div>
        </div>
        <h4 class="snapshot-props-surface__rules-title">
          {{ t('form.snapshotViewer.propDataRules') }}
        </h4>
        <!-- 501:19159：字段标识/数据类型/最大长度三值承接为原只读输入框 -->
        <div class="snapshot-props-surface snapshot-props-surface--rules">
          <div
            v-for="row in frozenFieldPropRows.slice(5, 8)"
            :key="row.label"
            class="snapshot-props-surface__group"
          >
            <label class="snapshot-props-surface__label">{{ row.label }}</label>
            <input class="snapshot-props-surface__input" :value="row.value" readonly />
          </div>
        </div>
        <div class="snapshot-props-surface__rules">
          <template v-for="row in frozenFieldPropRows.slice(8)" :key="row.label">
            <div class="snapshot-props-surface__rule">
              <span class="snapshot-props-surface__rule-label">{{ row.label }}</span>
              <span class="snapshot-props-surface__rule-value">{{ row.value }}</span>
              <el-button
                v-if="row.detail"
                link
                type="primary"
                size="small"
                @click="emit('open-detail', row)"
              >
                {{ t('common.view') }}
              </el-button>
            </div>
            <pre v-if="row.detail === 'script'" class="snapshot-props-surface__script">{{
              fieldScriptOf(selectedField.name)
            }}</pre>
          </template>
        </div>
      </template>
      <p v-else class="snapshot-empty">
        {{ t('form.snapshotViewer.noData') }}
      </p>
    </aside>
  </div>
</template>

<style scoped>
.snapshot-tabbody--design {
  display: flex;
  align-items: stretch;
  min-height: 0;
}

/* 表单设计：左 252 / 右 336（272:1518） */
.snapshot-tabbody--design .snapshot-side--fields {
  flex: 0 0 252px;
}

.snapshot-tabbody--design .snapshot-side--props {
  flex: 0 0 336px;
  border-left: 1px solid var(--sw-border-light);
}

.snapshot-tabbody__main {
  flex: 1 1 auto;
  box-sizing: border-box;
  min-width: 0;
  padding: 20px 24px 24px;
  overflow-y: auto;
}

.snapshot-side {
  box-sizing: border-box;
  padding: 20px 16px 24px;
  overflow-y: auto;
  background: var(--sw-surface-card);
}

.snapshot-side--fields {
  border-right: 1px solid var(--sw-border-light);
}

.snapshot-side h4 {
  margin: 0 0 12px;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.snapshot-component-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.snapshot-component-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.snapshot-component-list button small {
  color: var(--sw-text-secondary);
  font-size: 11px;
}

.snapshot-component-list button:hover {
  background: var(--sw-color-primary-soft);
}

.snapshot-component-list button.is-active {
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-weight: 600;
}

/* 执行提示14：中央只读组件画布恢复原白色表面（移除灰色大卡片） */
.snapshot-design {
  padding: 0;
  border: none;
  border-radius: 0;
  background: #fff;
}

.snapshot-design__description {
  margin: 0 0 var(--sw-space-12);
  color: var(--sw-text-regular);
  font-size: var(--sw-font-secondary);
  line-height: 1.6;
}

.snapshot-design__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: var(--sw-form-row-gap);
}

.snapshot-design__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: var(--sw-space-16);
  align-items: start;
}

.snapshot-design__cell {
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--sw-radius-base);
  cursor: pointer;
}

.snapshot-design__cell.is-selected {
  border-color: var(--sw-color-primary);
}

.snapshot-design__props {
  box-sizing: border-box;
  padding: var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-surface-card);
}

.snapshot-design__props h4 {
  margin: 0 0 var(--sw-space-8);
  font-size: var(--sw-font-secondary);
  font-weight: 600;
}

.snapshot-design__props-target {
  margin: 0 0 var(--sw-space-8);
  color: var(--sw-color-primary);
  font-size: var(--sw-font-caption);
}

.snapshot-design__props dl {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 6px var(--sw-space-8);
  margin: 0;
}

.snapshot-design__props dt {
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
}

.snapshot-design__props dd {
  margin: 0;
  color: var(--sw-text-regular);
  font-size: var(--sw-font-caption);
  overflow-wrap: anywhere;
}

/* 冻结画布沿用真实控件形态：多行说明 80 高、日期占所属栏（colSpan 由 FormPreview 承担）。 */
.snapshot-design .el-textarea__inner {
  box-sizing: border-box;
  min-height: 80px;
  height: 80px;
}

/* 272:1518（执行提示14）：表单右栏只读控件表面——TEXT 前五框 x1604/w296/h32、y188/264/340/416/492，
   标签 14/22 mb6、组距 16（步距 76）、默认边框 #DDE3EF；数据规则/脚本/显隐按真实配置可读承接。 */
.snapshot-tabbody--design .snapshot-side--props-surface {
  padding: 20px;
}

.snapshot-props-surface {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 22px;
}

.snapshot-props-surface__group {
  display: flex;
  flex-direction: column;
}

.snapshot-props-surface__label {
  display: block;
  margin-bottom: 6px;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__input {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #dde3ef;
  border-radius: 4px;
  background: #fff;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 30px;
  font-family: inherit;
}

.snapshot-props-surface__input[readonly] {
  cursor: default;
}

.snapshot-props-surface--rules {
  margin-top: 0;
}

.snapshot-side .snapshot-props-surface__rules-title {
  margin: 22px 0 12px;
}

.snapshot-props-surface__rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.snapshot-props-surface__rule {
  display: flex;
  align-items: center;
  gap: 8px;
}

.snapshot-props-surface__rule-label {
  flex: 0 0 auto;
  color: var(--sw-text-regular);
  font-size: 14px;
  line-height: 22px;
}

.snapshot-props-surface__rule-value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.snapshot-props-surface__script {
  box-sizing: border-box;
  width: 100%;
  max-height: 160px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #f8fafc;
  color: var(--sw-text-regular);
  font-size: 12px;
  line-height: 18px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.snapshot-empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

.snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

@media (max-width: 900px) {
  .snapshot-tabbody--design {
    flex-direction: column;
  }

  .snapshot-tabbody__main {
    max-height: 58vh;
  }
}
</style>
