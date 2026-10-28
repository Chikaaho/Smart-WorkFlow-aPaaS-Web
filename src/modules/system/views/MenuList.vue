<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { listMenuItems, updateMenuItem, type MenuManageItem } from '@/modules/system/api/menu'
import { MENU_ICON_KEYS, menuIcon } from '@/layouts/menu-icons'
import type { Component } from 'vue'

const { t } = useI18n()
/**
 * MenuList — 菜单管理（V012-BUG-011/017）。
 * 树形展示目录/菜单；图标（通用库白名单）/标题/排序/显隐受控编辑；
 * 路由身份字段（name/path/component/permission）只读，防止破坏菜单-路由-权限契约。
 */
const items = ref<MenuManageItem[]>([])
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')

const dialogVisible = ref(false)
const editing = ref<MenuManageItem | null>(null)
const editTitle = ref('')
const editIcon = ref<string | null>(null)
const editSort = ref<number | null>(null)
const editHidden = ref(false)
const saving = ref(false)
const canManage = hasPerm('system:menu:manage')
const menuTable = ref<{ toggleRowExpansion: (row: unknown, expanded?: boolean) => void } | null>(
  null,
)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    items.value = await listMenuItems()
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('system.menuLoadFailed')
  } finally {
    loading.value = false
  }
}

/** 目录 → 后代菜单的扁平展开；命中深层菜单时保留其祖先和必要路径。 */
const tree = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const match = (i: MenuManageItem) =>
    !kw || i.title.toLowerCase().includes(kw) || (i.path ?? '').toLowerCase().includes(kw)
  const dirs = items.value
    .filter((i) => i.menuType === 0 && i.parentId === null)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  const byParent = new Map<string, MenuManageItem[]>()
  for (const item of items.value) {
    if (item.parentId == null) continue
    const list = byParent.get(item.parentId) ?? []
    list.push(item)
    byParent.set(item.parentId, list)
  }
  for (const children of byParent.values()) {
    children.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  }

  const descendants = (parentId: string, ancestorMatched: boolean): MenuManageItem[] => {
    const result: MenuManageItem[] = []
    for (const child of byParent.get(parentId) ?? []) {
      const childMatched = ancestorMatched || match(child)
      const nested = descendants(child.id, childMatched)
      if (childMatched || nested.length > 0) result.push(child, ...nested)
    }
    return result
  }

  return dirs
    .map((dir) => {
      const subItems = descendants(dir.id, match(dir))
      return { dir, subItems }
    })
    .filter((g) => match(g.dir) || g.subItems.length > 0)
})

function openEdit(row: MenuManageItem) {
  if (!canManage) return
  editing.value = row
  editTitle.value = row.title
  editIcon.value = row.icon
  editSort.value = row.sort
  editHidden.value = !!row.hidden
  dialogVisible.value = true
}

function rowActions(r: unknown): ListAction[] {
  const row = r as MenuManageItem
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      visible: canManage,
      onClick: () => openEdit(row),
    },
  ]
}

function setAllExpanded(expanded: boolean) {
  for (const group of tree.value) {
    menuTable.value?.toggleRowExpansion(group, expanded)
  }
}

async function save() {
  if (!editing.value) return
  saving.value = true
  try {
    await updateMenuItem(editing.value.id, {
      title: editTitle.value,
      icon: editIcon.value,
      sort: editSort.value ?? undefined,
      hidden: editHidden.value,
    })
    ElMessage.success(t('system.menuSaved'))
    dialogVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('system.menuSaveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    appearance="design"
    :total="tree.length"
    :page-num="1"
    :page-size="10"
    :empty="tree.length === 0 && !loading"
    hide-pagination
  >
    <template #table-title>
      <strong>{{ t('system.menuManagement') }}</strong>
      <div class="table-tree-actions">
        <el-button @click="setAllExpanded(true)">{{ t('common.expand') }}</el-button>
        <el-button @click="setAllExpanded(false)">{{ t('common.collapse') }}</el-button>
      </div>
    </template>
    <template #filter>
      <ListFilterItem :label="t('system.menuTitle')">
        <el-input
          v-model="keyword"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="loadList"
        />
      </ListFilterItem>
    </template>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table ref="menuTable" v-loading="loading" :data="tree" row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table
            :data="(row as any).subItems"
            row-key="id"
            size="small"
            style="margin: 4px 24px 12px 48px"
          >
            <el-table-column :label="t('system.menuTitle')" min-width="160">
              <template #default="{ row: c }">{{ (c as MenuManageItem).title }}</template>
            </el-table-column>
            <el-table-column :label="t('system.menuPath')" min-width="180">
              <template #default="{ row: c }">{{ (c as MenuManageItem).path }}</template>
            </el-table-column>
            <el-table-column :label="t('system.menuIcon')" width="120">
              <template #default="{ row: c }">
                <el-icon v-if="menuIcon((c as MenuManageItem).icon ?? undefined)"
                  ><component :is="menuIcon((c as MenuManageItem).icon ?? undefined) as Component"
                /></el-icon>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="sort" :label="t('system.menuSort')" width="90" />
            <el-table-column :label="t('system.menuHidden')" width="100">
              <template #default="{ row: c }">
                <el-tag v-if="(c as MenuManageItem).hidden" size="small" type="info">{{
                  t('system.menuHiddenYes')
                }}</el-tag>
                <el-tag v-else size="small" type="success">{{ t('system.menuHiddenNo') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="100">
              <template #default="{ row: c }">
                <el-button
                  v-if="canManage"
                  link
                  type="primary"
                  size="small"
                  @click="openEdit(c as MenuManageItem)"
                  >{{ t('common.edit') }}</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column :label="t('system.menuTitle')" min-width="160">
        <template #default="{ row }">{{ (row as { dir: MenuManageItem }).dir.title }}</template>
      </el-table-column>
      <el-table-column :label="t('system.menuPath')" min-width="180">
        <template #default="{ row }">{{ (row as { dir: MenuManageItem }).dir.path }}</template>
      </el-table-column>
      <el-table-column :label="t('system.menuIcon')" width="120">
        <template #default="{ row }">
          <template v-if="menuIcon((row as { dir: MenuManageItem }).dir.icon ?? undefined)">
            <el-icon
              ><component
                :is="menuIcon((row as { dir: MenuManageItem }).dir.icon ?? undefined) as Component"
            /></el-icon>
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('system.menuSubCount')" width="100">
        <template #default="{ row }">{{
          (row as { subItems: MenuManageItem[] }).subItems.length
        }}</template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="100" />
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      class="sw-edit-dialog"
      align-center
      :title="t('system.menuEditTitle')"
      width="760px"
    >
      <div class="sw-edit-grid">
        <div class="form-field">
          <label class="form-field__label">{{ t('system.menuTitle') }}</label>
          <el-input v-model="editTitle" maxlength="32" />
        </div>
        <div class="form-field">
          <label class="form-field__label">{{ t('system.menuIcon') }}</label>
          <!-- 通用图标库白名单选择器（非必填） -->
          <div class="icon-picker">
            <button
              v-for="key in MENU_ICON_KEYS"
              :key="key"
              type="button"
              class="icon-picker__cell"
              :class="{ 'icon-picker__cell--active': editIcon === key }"
              :aria-label="`${t('system.menuIcon')}: ${key}`"
              :aria-pressed="editIcon === key"
              :title="`${t('system.menuIcon')}: ${key}`"
              @click="editIcon = editIcon === key ? null : key"
            >
              <el-icon><component :is="menuIcon(key) as Component" /></el-icon>
            </button>
          </div>
          <div class="icon-picker__current">
            {{ editIcon ?? t('system.menuIconNone') }}
            <el-button v-if="editIcon" link size="small" @click="editIcon = null">{{
              t('common.reset')
            }}</el-button>
          </div>
        </div>
        <div class="form-field">
          <label class="form-field__label">{{ t('system.menuSort') }}</label>
          <el-input-number v-model="editSort" :min="0" :max="999" style="width: 100%" />
        </div>
        <div class="form-field">
          <label class="form-field__label">{{ t('system.menuHidden') }}</label>
          <div class="hidden-row">
            <el-switch v-model="editHidden" />
            <span class="hidden-row__text">{{
              editHidden ? t('common.yes') : t('common.no')
            }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </StandardListTemplate>
</template>

<style scoped>
.table-tree-actions {
  display: flex;
  gap: var(--sw-space-8);
}
</style>

<style>
/* 弹窗经 Teleport 渲染，内容元素不带组件作用域属性：编辑弹窗内部规则使用全局类名（本页专用）。 */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-field__label {
  font-size: 14px;
  line-height: 22px;
  color: var(--sw-text-regular);
}

.hidden-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.hidden-row__text {
  font-size: 14px;
  line-height: 22px;
  color: var(--sw-text-regular);
}

.icon-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, 36px);
  gap: 8px;
  width: 100%;
}
.icon-picker__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.icon-picker__cell--active {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}
.icon-picker__current {
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
</style>
