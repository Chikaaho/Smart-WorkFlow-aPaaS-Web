<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import type { FormSchemaField, TableSubField } from '@/contracts/form-schema'
import type { DesignerItem } from './types'
import type { FieldPatch } from './field-config'
import { getFieldTypeDescriptor, getFieldTypeStorage, supportsFieldLength } from './field-types'

const { t } = useI18n()

/**
 * FieldListPanel —— 「字段清单」工作区（0.1.7 #38/#39，参考同类产品数据模型页）。
 *
 * 口径（Owner）：
 *   - 不止主表单：主表 + 每个子表（TABLE 字段）各成一张「表」，可切换查看其字段；
 *   - **不提供删除与停用**（不是参考产品的那两列，本清单不做）；
 *   - 「发布过的字段只能改长度、名称和描述」——可编辑项只有 字段名 / 字段长度 / 描述，
 *     字段编码、控件类型、数据类型、必填一律只读事实。
 *
 * 单一数据源：行里的 field 就是画布持有的那个字段对象（主字段或子表子字段）引用，
 * 编辑只回抛补丁给宿主（applyFieldPatch 写回），本组件不另存第二份、不改结构。
 */
const props = defineProps<{
  /** 画布字段项（主表顺序 + 子表子字段来自 TABLE 字段的 subFields）。 */
  items: DesignerItem[]
  /** 表单 formKey（表名展示口径：主表=formKey，子表=formKey.子表字段编码）。 */
  formKey: string
}>()

const emit = defineEmits<{
  /** 字段补丁（label / length / description）；宿主 applyFieldPatch 写回画布字段对象。 */
  patch: [payload: { field: FormSchemaField | TableSubField; patch: FieldPatch }]
  /** 导出字段清单（下载由宿主统一处理）。 */
  export: []
}>()

interface FieldRow {
  /** 行稳定键（主表=项 id；子表=项 id + 子字段下标） */
  key: string
  index: number
  field: FormSchemaField | TableSubField
}

interface TableScope {
  key: string
  label: string
  tableName: string
  rows: FieldRow[]
}

/** 主表范围 = 全部主字段（含 TABLE 本身；设计 49:2 明确列出“演练资源/子表/JSON”行）。 */
function mainRows(): FieldRow[] {
  return props.items.map((item, index) => ({
    key: item.id,
    index: index + 1,
    field: item.field,
  }))
}

function subRows(item: DesignerItem): FieldRow[] {
  const field = item.field
  const subFields = field.type === 'TABLE' ? (field.subFields ?? []) : []
  return subFields.map((subField, index) => ({
    key: `${item.id}-${index}`,
    index: index + 1,
    field: subField,
  }))
}

const scopes = computed<TableScope[]>(() => [
  {
    key: 'main',
    label: t('fieldList.mainTable'),
    tableName: props.formKey,
    rows: mainRows(),
  },
  ...props.items
    .filter((item) => item.field.type === 'TABLE')
    .map((item) => ({
      key: item.id,
      label: item.field.label || item.field.name,
      tableName: `${props.formKey}.${item.field.name}`,
      rows: subRows(item),
    })),
])

const activeScopeKey = ref('main')
const search = ref('')

/** 范围失效（切表单/删子表）时回落到主表。 */
watch(scopes, (list) => {
  if (!list.some((scope) => scope.key === activeScopeKey.value)) activeScopeKey.value = 'main'
})

const activeScope = computed<TableScope>(
  () => scopes.value.find((scope) => scope.key === activeScopeKey.value) ?? scopes.value[0]!,
)

/**
 * 只有主表（没有子表）时不渲染表范围与表名：单表无从切换，
 * 表名又与面包屑表单名重复——0.1.7 #40 Owner「噪音信息太多」据此收敛。
 */
const hasMultipleTables = computed(() => scopes.value.length > 1)

const rows = computed<FieldRow[]>(() => {
  const keyword = search.value.trim().toLowerCase()
  const list = activeScope.value.rows
  if (!keyword) return list
  return list.filter(
    (row) =>
      (row.field.label ?? '').toLowerCase().includes(keyword) ||
      row.field.name.toLowerCase().includes(keyword),
  )
})

/** 控件类型（注册表中文名；TEXT 按 multiline 区分单行/多行；未知类型回落字段编码）。 */
function componentLabel(field: FormSchemaField): string {
  if (field.type === 'TEXT' && (field as { multiline?: boolean }).multiline === true) {
    return t('form.paletteMultiline')
  }
  return getFieldTypeDescriptor(field.type)?.label ?? field.type
}

/** 字段类型 → 存储列类型族（展示语义，映射见 field-types 共享表）。 */
function storageTypeOf(type: string): string {
  return getFieldTypeStorage(type)
}

function patchLabel(row: FieldRow, label: string) {
  emit('patch', { field: row.field, patch: { label } })
}

function patchLength(row: FieldRow, length: number | undefined) {
  emit('patch', { field: row.field, patch: { length } })
}

function patchDescription(row: FieldRow, description: string) {
  emit('patch', { field: row.field, patch: { description } })
}
</script>

<template>
  <div class="field-list">
    <!-- 表范围：仅多表（主表 + 子表）时出现——单表无从切换，不占一行 -->
    <div
      v-if="hasMultipleTables"
      class="field-list__scopes"
      role="tablist"
      :aria-label="t('fieldList.mainTable')"
    >
      <button
        v-for="scope in scopes"
        :key="scope.key"
        type="button"
        role="tab"
        class="field-list__scope"
        :class="{ 'is-active': scope.key === activeScope.key }"
        :aria-selected="scope.key === activeScope.key"
        :data-testid="'field-scope-' + scope.key"
        @click="activeScopeKey = scope.key"
      >
        {{ scope.label }}
      </button>
    </div>

    <div class="field-list__meta">
      <span
        v-if="hasMultipleTables"
        class="field-list__table-name"
        data-testid="field-table-name"
        >{{ t('fieldList.tableName', { name: activeScope.tableName }) }}</span
      >
      <el-input
        v-model="search"
        class="field-list__search"
        :placeholder="t('fieldList.searchPlaceholder')"
        clearable
      />
      <el-button class="field-list__export" data-testid="field-export" @click="emit('export')">{{
        t('fieldList.exportFields')
      }}</el-button>
    </div>

    <p v-if="rows.length === 0" class="field-list__empty" data-testid="field-list-empty">
      {{ t('fieldList.emptyRows') }}
    </p>
    <el-table
      v-else
      :data="rows"
      size="small"
      max-height="560"
      row-key="key"
      class="field-list__table"
    >
      <el-table-column :label="t('fieldList.colIndex')" width="56" align="center">
        <template #default="{ row }">{{ row.index }}</template>
      </el-table-column>
      <el-table-column :label="t('fieldList.colName')" min-width="220">
        <template #default="{ row }">
          <el-input
            :model-value="row.field.label ?? ''"
            maxlength="60"
            :data-testid="'field-label-' + row.key"
            :placeholder="row.field.name"
            @update:model-value="(value: string) => patchLabel(row as FieldRow, value)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('fieldList.colKey')" min-width="190">
        <template #default="{ row }"
          ><code class="field-list__key">{{ row.field.name }}</code></template
        >
      </el-table-column>
      <el-table-column :label="t('fieldList.colComponent')" width="116">
        <template #default="{ row }">{{ componentLabel(row.field) }}</template>
      </el-table-column>
      <el-table-column :label="t('fieldList.storageType')" width="110">
        <template #default="{ row }">{{ storageTypeOf(row.field.type) }}</template>
      </el-table-column>
      <el-table-column :label="t('fieldList.colLength')" width="132">
        <template #default="{ row }">
          <el-input-number
            v-if="supportsFieldLength(row.field.type)"
            :model-value="row.field.length"
            :min="1"
            :controls="false"
            :data-testid="'field-length-' + row.key"
            :placeholder="t('form.unlimited')"
            @update:model-value="(value: number | undefined) => patchLength(row as FieldRow, value)"
          />
          <span v-else class="field-list__dash">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('fieldList.colRequired')" width="72" align="center">
        <template #default="{ row }">{{
          row.field.required ? t('common.yes') : t('common.no')
        }}</template>
      </el-table-column>
      <el-table-column :label="t('fieldList.colDescription')" min-width="220">
        <template #default="{ row }">
          <el-input
            :model-value="row.field.description ?? ''"
            maxlength="200"
            :data-testid="'field-description-' + row.key"
            :placeholder="t('fieldList.descriptionPlaceholder')"
            @update:model-value="(value: string) => patchDescription(row as FieldRow, value)"
          />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.field-list {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: 0;
  padding: 18px 24px 24px;
  overflow: auto;
  background: #fff;
}

/* 表范围：主表 / 子表（明细表） */
.field-list__scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.field-list__scope {
  height: 32px;
  padding: 0 16px;
  border: 1px solid #e3e8f4;
  border-radius: 8px;
  background: #f7f9fe;
  color: #46506a;
  font-size: 13px;
  cursor: pointer;
}
.field-list__scope.is-active {
  border-color: var(--el-color-primary);
  background: #fff;
  color: var(--el-color-primary);
  font-weight: 600;
}

.field-list__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.field-list__table-name {
  font-size: 13px;
  color: #46506a;
}
.field-list__search {
  width: 320px;
  margin-left: auto;
}
.field-list__export {
  width: 116px;
  height: 32px;
}

.field-list__key {
  font-size: 12px;
  color: var(--sw-color-primary);
}
.field-list__dash {
  color: #a8abb2;
}
.field-list__table :deep(.el-input__wrapper),
.field-list__table :deep(.el-input-number) {
  width: 100%;
}
.field-list__empty {
  margin: 0;
  color: #8c99b0;
  font-size: 13px;
}
</style>
