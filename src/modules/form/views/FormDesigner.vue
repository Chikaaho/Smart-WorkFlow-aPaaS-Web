<script setup lang="ts">
/**
 * 表单设计器（第四刀：草稿保存 + 发布接线）。
 *
 * 三栏：控件库（左）→ 画布（中）→ 配置面板（右），底部保存草稿 / 发布。
 *
 * 生命周期：
 *   - 新建：路由无 id 参数 → 空白画布，保存时先建草稿再存 definition。
 *   - 编辑：路由有 id 参数 → 加载已存 definition 回显画布，保存时直接更新 definition。
 *   - 已发布：status==PUBLISHED → 编辑区/保存/发布全部灰化。
 */

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormSchema, TableSubField } from '@/contracts/form-schema'
import FieldPalette from '../designer/FieldPalette.vue'
import DesignerCanvas from '../designer/DesignerCanvas.vue'
import FieldConfigPanel from '../designer/FieldConfigPanel.vue'
import SubFieldDesigner from '../designer/SubFieldDesigner.vue'
import PreviewModal from '../designer/PreviewModal.vue'
import { saveDraftDefinition, publishDefinition as publishDef } from '../designer/draft-actions'
import { applyFieldPatch, type FieldPatch } from '../designer/field-config'
import { itemsToDefinition, definitionToItems } from '../designer/definition-convert'
import { getFormDefinitionById } from '../api/form-def'
import type { FormDefStatus } from '../api/form-def'
import type { DesignerItem } from '../designer/types'

const route = useRoute()
const router = useRouter()

/* ── 表单定义标识 ── */
const formId = ref<string | null>(null)
const formKey = ref<string>('')
const status = ref<FormDefStatus>('DRAFT')

/* ── 设计态 ── */
const title = ref('未命名表单')
const items = ref<DesignerItem[]>([])
const selectedId = ref<string | null>(null)
const previewVisible = ref(false)
const loading = ref(false)

/* ── 已发布标记（驱动灰化） ── */
const isPublished = computed(() => status.value === 'PUBLISHED')

const existingNames = computed(() => items.value.map((it) => it.field.name))
const selectedItem = computed(() => items.value.find((it) => it.id === selectedId.value) ?? null)
const otherNames = computed(() =>
  items.value.filter((it) => it.id !== selectedId.value).map((it) => it.field.name),
)

/** 配置面板回写：就地把补丁合并进选中字段。 */
function patchSelectedField(patch: FieldPatch) {
  const item = items.value.find((it) => it.id === selectedId.value)
  if (item) applyFieldPatch(item.field, patch)
}

/* ── 子表盖层编辑（独立状态，与主画布隔离） ── */
const editingTableId = ref<string | null>(null)
/** 正在盖层里编辑的子表字段（仅 TABLE 才有；非 TABLE / 未编辑为 null）。 */
const editingTableField = computed(() => {
  const item = items.value.find((it) => it.id === editingTableId.value)
  return item && item.field.type === 'TABLE' ? item.field : null
})

/** 点主画布子表占位的「编辑」入口 → 打开盖层（已发布则拒绝进入，不可改子字段）。 */
function openTableEditor(id: string) {
  if (isPublished.value) return
  editingTableId.value = id
}

/** 盖层返回 → 把子字段写回该子表字段的 subFields，关盖层。 */
function closeTableEditor(subFields: TableSubField[]) {
  const item = items.value.find((it) => it.id === editingTableId.value)
  if (item && item.field.type === 'TABLE') {
    item.field.subFields = subFields
  }
  editingTableId.value = null
}

/** 从画布导出表单定义（纯数据，无 UI id）。 */
function buildDefinition(): FormSchema {
  return itemsToDefinition(items.value, title.value)
}

/** 全屏预览的数据源。 */
const previewSchema = computed<FormSchema>(() => buildDefinition())

/* ── 回显已存设计 ── */

async function loadDefinition(id: string) {
  loading.value = true
  try {
    const schema = await getFormDefinitionById(id)
    title.value = schema.title
    items.value = definitionToItems(schema)
    // 重置 UI id 序列号，避免与已存 id 冲突
    // definitionToItems 内部已用 nextDesignerItemId 生成新 id，无需额外处理。
  } catch {
    ElMessage.error('加载表单定义失败')
    // 加载失败回退到列表页（若入口无列表页则留在设计器空白态）
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const idParam = route.params.id as string | undefined
  if (idParam) {
    formId.value = idParam
    // formKey 在 loadDefinition 后会从 title 推断；真正的 formKey 在 FormDefDTO 中，
    // 但当前 GET definition 不返回 formKey，故此处用路由 id 作为临时标识。
    // 后续若需 formKey 用于保存（新建时），会从用户输入或后端返回中获取。
    loadDefinition(idParam)
  }
  // 新建态：空白画布，保持默认值。
})

/* ── 保存草稿 ── */

async function saveDraft() {
  if (isPublished.value) return

  const definition = buildDefinition()
  // 新建态用 title 作为 formKey（简化：formKey 可后续用 slug 函数规范化）
  // 编辑态已有 formId，直接存。
  const key = formKey.value || generateFormKey(title.value)

  try {
    const result = await saveDraftDefinition(definition, formId.value, key)
    // 新建态：保存成功后拿到 id，切到编辑态路由
    if (!formId.value && result.id) {
      formId.value = result.id
      formKey.value = key
      status.value = result.status
      // 替换路由，不带刷新
      router.replace({ name: 'form-designer', params: { id: result.id } })
    }
  } catch {
    // 错误已在 draft-actions 中处理（ElMessage.error）
  }
}

/* ── 发布 ── */

async function publish() {
  if (isPublished.value) return
  if (!formId.value) {
    ElMessage.warning('请先保存草稿再发布')
    return
  }

  // 客户端预校验（减往返 UX）
  const preCheckError = preValidateBeforePublish(items.value)
  if (preCheckError) {
    ElMessage.warning(preCheckError)
    return
  }

  // 二次确认
  try {
    await ElMessageBox.confirm('发布后表名/字段名冻结，不可修改。确认发布？', '发布确认', {
      confirmButtonText: '确认发布',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  const definition = buildDefinition()
  try {
    const result = await publishDef(definition, formId.value)
    status.value = result.status
  } catch {
    // 错误已在 draft-actions 中处理
  }
}

/* ── 辅助函数 ── */

/** 生成 formKey（简化：取标题的拼音/英文 slug 或直接用时间戳后缀）。 */
function generateFormKey(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'form_' + Date.now()
  // 简单 slug：去除非字母数字，转小写，取前 30 字符
  const slug = trimmed
    .replace(/[^a-zA-Z0-9_一-龥]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .slice(0, 30)
  return slug || 'form_' + Date.now()
}

/**
 * 发布前客户端预校验（可选，减往返）。
 *
 * 仅做轻量检查：列名合法性、DICT 有无 dictType、REFERENCE 有无 targetFormId、
 * TABLE 有无子列。这些是常见遗漏，提前拦可省一次后端往返。
 * 真校验仍以后端 publish 为准——此处检查通过不意味发布一定成功。
 */
function preValidateBeforePublish(list: DesignerItem[]): string | null {
  for (const item of list) {
    const field = item.field

    // 列名合法性（仅允许字母/数字/下划线，不能以数字开头）
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
      return `字段名 "${field.name}" 不合法（仅允许字母/数字/下划线，且不能以数字开头）`
    }

    // DICT 未绑定字典类型
    if (field.type === 'DICT' && !field.dictType) {
      return `字典字段 "${field.name}" 未绑定字典类型`
    }

    // REFERENCE 未指定目标表单
    if (field.type === 'REFERENCE' && !field.targetFormId) {
      return `引用字段 "${field.name}" 未指定目标表单`
    }

    // TABLE 无子列
    if (field.type === 'TABLE' && field.subFields.length === 0) {
      return `子表格字段 "${field.name}" 未定义子列`
    }
  }
  return null
}
</script>

<template>
  <div class="designer">
    <header class="designer__header">
      <el-input
        v-model="title"
        class="designer__title"
        placeholder="表单名称"
        :disabled="isPublished"
      />
      <div class="designer__actions">
        <el-button @click="previewVisible = true">预览</el-button>
        <el-button :disabled="isPublished" @click="saveDraft">保存草稿</el-button>
        <el-button type="primary" :disabled="isPublished" @click="publish">发布</el-button>
      </div>
    </header>

    <div v-if="loading" class="designer__loading">
      <span>加载中...</span>
    </div>

    <div v-else class="designer__body">
      <FieldPalette :existing-names="existingNames" :disabled="isPublished" />
      <DesignerCanvas
        v-model:items="items"
        v-model:selected-id="selectedId"
        :readonly="isPublished"
        @edit-table="openTableEditor"
      />
      <FieldConfigPanel
        :field="selectedItem"
        :other-names="otherNames"
        :readonly="isPublished"
        @update="patchSelectedField"
      />
    </div>

    <!-- 已发布状态提示条 -->
    <div v-if="isPublished" class="designer__published-bar">
      此表单已发布，表名和字段已冻结，不可编辑。
    </div>

    <!-- 子表盖层子画布：盖在主画布之上，独立状态编辑该子表的内部字段 -->
    <SubFieldDesigner
      v-if="editingTableField"
      :table-label="editingTableField.label || editingTableField.name"
      :sub-fields="editingTableField.subFields"
      :readonly="isPublished"
      @close="closeTableEditor"
    />

    <PreviewModal v-model:visible="previewVisible" :schema="previewSchema" />
  </div>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.designer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sw-space-16);
  padding: var(--sw-space-12) var(--sw-space-24);
  border-bottom: 1px solid var(--sw-border-light);
}

.designer__title {
  max-width: 320px;
}

.designer__actions {
  display: flex;
  gap: var(--sw-space-8);
}

.designer__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--sw-text-secondary);
  font-size: 14px;
}

.designer__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.designer__published-bar {
  padding: var(--sw-space-8) var(--sw-space-24);
  background: var(--sw-color-warning-bg, #fdf6ec);
  color: var(--sw-color-warning, #e6a23c);
  font-size: 13px;
  text-align: center;
  border-top: 1px solid var(--sw-border-light);
}
</style>
