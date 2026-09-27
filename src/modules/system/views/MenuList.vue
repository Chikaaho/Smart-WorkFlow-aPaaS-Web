<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
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

/** 两级树：目录 → 其子项；keyword 过滤标题/路径。 */
const tree = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const match = (i: MenuManageItem) =>
    !kw || i.title.toLowerCase().includes(kw) || i.path.toLowerCase().includes(kw)
  const dirs = items.value.filter((i) => i.menuType === 0 && i.parentId === null)
  const byParent = new Map<string, MenuManageItem[]>()
  for (const item of items.value) {
    if (item.parentId == null) continue
    const list = byParent.get(item.parentId) ?? []
    list.push(item)
    byParent.set(item.parentId, list)
  }
  return dirs
    .map((dir) => {
      // 子项按 sort 排列；子目录（如 字典管理）其后内联展示二级子项
      const subItems: MenuManageItem[] = []
      for (const child of byParent.get(dir.id) ?? []) {
        if (!match(child)) continue
        subItems.push(child)
        if (child.menuType === 0) {
          for (const grand of byParent.get(child.id) ?? []) {
            if (match(grand)) subItems.push(grand)
          }
        }
      }
      return { dir, subItems }
    })
    .filter((g) => match(g.dir) || g.subItems.length > 0)
})

function openEdit(row: MenuManageItem) {
  editing.value = row
  editTitle.value = row.title
  editIcon.value = row.icon
  editSort.value = row.sort
  editHidden.value = !!row.hidden
  dialogVisible.value = true
}

function rowActions(r: unknown): ListAction[] {
  const row = r as MenuManageItem
  return [{ key: 'edit', label: t('common.edit'), onClick: () => openEdit(row) }]
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
    :title="t('system.menuManagement')"
    :total="tree.length"
    :page-num="1"
    :page-size="10"
    :empty="tree.length === 0 && !loading"
    hide-pagination
  >
    <template #filter>
      <el-input
        v-model="keyword"
        :placeholder="t('system.menuSearchPlaceholder')"
        clearable
        style="width: 240px"
        @keyup.enter="loadList"
      />
    </template>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="tree" stripe>
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

    <el-dialog v-model="dialogVisible" :title="t('system.menuEditTitle')" width="560px">
      <el-form label-width="100px">
        <el-form-item :label="t('system.menuTitle')">
          <el-input v-model="editTitle" maxlength="32" />
        </el-form-item>
        <el-form-item :label="t('system.menuIcon')">
          <!-- 通用图标库白名单选择器（非必填） -->
          <div class="icon-picker">
            <div
              v-for="key in MENU_ICON_KEYS"
              :key="key"
              class="icon-picker__cell"
              :class="{ 'icon-picker__cell--active': editIcon === key }"
              :title="key"
              @click="editIcon = editIcon === key ? null : key"
            >
              <el-icon><component :is="menuIcon(key) as Component" /></el-icon>
            </div>
          </div>
          <div class="icon-picker__current">
            {{ editIcon ?? t('system.menuIconNone') }}
            <el-button v-if="editIcon" link size="small" @click="editIcon = null">{{
              t('common.reset')
            }}</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('system.menuSort')">
          <el-input-number v-model="editSort" :min="0" :max="999" />
        </el-form-item>
        <el-form-item :label="t('system.menuHidden')">
          <el-switch v-model="editHidden" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </StandardListTemplate>
</template>

<style scoped>
.icon-picker {
  display: grid;
  grid-template-columns: repeat(8, 34px);
  gap: 4px;
  width: 100%;
}
.icon-picker__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: 1px solid var(--sw-border-light, #ebeef5);
  border-radius: 4px;
  cursor: pointer;
}
.icon-picker__cell--active {
  border-color: var(--sw-primary, #7e306b);
  color: var(--sw-primary, #7e306b);
  background: var(--sw-primary-5, #f2eaf0);
}
.icon-picker__current {
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary, #606266);
}
</style>
