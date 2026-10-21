<script setup lang="ts">
/**
 * AppTreeNav — 应用目录/表单树唯一实现。
 *
 * 用户端应用内页与管理端应用工作台共用；页头与底部动作由宿主通过插槽提供，
 * 目录/表单管理菜单按 form:app:manage 权限显隐。
 */
import { computed, ref } from 'vue'
import { CaretRight, Folder, MoreFilled } from '@element-plus/icons-vue'
import type { FormAppDir, FormAppFormItem } from '@/contracts/app-center'
import { hasPerm } from '@/foundation/permission'
import { useI18n } from '@/locales'

defineProps<{
  dirs: FormAppDir[]
  directForms: FormAppFormItem[]
  selectedFormKey: string
}>()

const emit = defineEmits<{
  select: [item: FormAppFormItem]
  'dir-command': [command: string, dir: FormAppDir]
  'form-command': [command: string, item: FormAppFormItem]
}>()

const { t } = useI18n()
const canManage = computed(() => hasPerm('form:app:manage'))

const collapsedDirIds = ref<string[]>([])

function isDirExpanded(dirId: string): boolean {
  return !collapsedDirIds.value.includes(dirId)
}

function toggleDir(dirId: string) {
  collapsedDirIds.value = collapsedDirIds.value.includes(dirId)
    ? collapsedDirIds.value.filter((id) => id !== dirId)
    : [...collapsedDirIds.value, dirId]
}
</script>

<template>
  <aside class="app-tree-nav">
    <slot name="header" />

    <nav class="app-tree-nav__tree" :aria-label="t('form.appCenter.appNavTitle')">
      <template v-for="dir in dirs" :key="dir.id">
        <div
          class="app-tree-nav__dir"
          data-testid="app-tree-dir"
          role="button"
          tabindex="0"
          :aria-expanded="isDirExpanded(dir.id)"
          @click="toggleDir(dir.id)"
          @keydown.enter.prevent="toggleDir(dir.id)"
          @keydown.space.prevent="toggleDir(dir.id)"
        >
          <el-icon
            class="app-tree-nav__dir-caret"
            :class="{ 'is-collapsed': !isDirExpanded(dir.id) }"
            aria-hidden="true"
          >
            <CaretRight />
          </el-icon>
          <el-icon class="app-tree-nav__dir-icon"><Folder /></el-icon>
          <span class="app-tree-nav__dir-name">{{ dir.name }}</span>
          <el-dropdown
            v-if="canManage"
            class="app-tree-nav__more"
            trigger="click"
            @command="(cmd: string) => emit('dir-command', cmd, dir)"
          >
            <span
              class="app-tree-nav__more-trigger"
              :data-testid="'dir-more-' + dir.id"
              @click.stop
            >
              <el-icon><MoreFilled /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="rename">{{ t('common.edit') }}</el-dropdown-item>
                <el-dropdown-item command="form">
                  {{ t('form.appCenter.newFormInDir') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  {{ t('common.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <template v-if="isDirExpanded(dir.id)">
          <button
            v-for="item in dir.forms ?? []"
            :key="item.formId"
            type="button"
            class="app-tree-nav__form"
            :class="{ 'is-active': item.formKey === selectedFormKey }"
            data-testid="app-tree-form"
            :data-form-key="item.formKey"
            @click="emit('select', item)"
          >
            <span class="app-tree-nav__form-name">{{ item.name }}</span>
            <el-dropdown
              v-if="canManage"
              class="app-tree-nav__more"
              trigger="click"
              @command="(cmd: string) => emit('form-command', cmd, item)"
            >
              <span class="app-tree-nav__more-trigger" @click.stop>
                <el-icon><MoreFilled /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="design">
                    {{ t('form.appCenter.enterFormDesign') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="rename">{{ t('common.edit') }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    {{ t('common.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </button>
          <p v-if="(dir.forms?.length ?? 0) === 0" class="app-tree-nav__empty">
            {{ t('form.appCenter.emptyDir') }}
          </p>
        </template>
      </template>

      <button
        v-for="item in directForms"
        :key="item.formId"
        type="button"
        class="app-tree-nav__form app-tree-nav__form--root"
        :class="{ 'is-active': item.formKey === selectedFormKey }"
        data-testid="app-tree-form"
        :data-form-key="item.formKey"
        @click="emit('select', item)"
      >
        <span class="app-tree-nav__form-name">{{ item.name }}</span>
        <el-dropdown
          v-if="canManage"
          class="app-tree-nav__more"
          trigger="click"
          @command="(cmd: string) => emit('form-command', cmd, item)"
        >
          <span class="app-tree-nav__more-trigger" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="design">
                {{ t('form.appCenter.enterFormDesign') }}
              </el-dropdown-item>
              <el-dropdown-item command="rename">{{ t('common.edit') }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('common.delete') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </button>
    </nav>

    <div v-if="$slots.footer" class="app-tree-nav__foot">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.app-tree-nav {
  display: flex;
  flex: 0 0 240px;
  flex-direction: column;
  width: 240px;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #ebeef5;
}

.app-tree-nav__tree {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 8px 12px 16px;
  overflow-y: auto;
}

.app-tree-nav__dir {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 2px;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.app-tree-nav__dir:first-child {
  margin-top: 0;
}

.app-tree-nav__dir:hover .app-tree-nav__dir-name {
  color: #409eff;
}

.app-tree-nav__dir-caret {
  color: #909399;
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}

.app-tree-nav__dir-caret.is-collapsed {
  transform: rotate(0deg);
}

.app-tree-nav__dir-icon {
  color: #909399;
}

.app-tree-nav__dir-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-tree-nav__form {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 7px 26px 7px 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #606266;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.app-tree-nav__form--root {
  margin-top: 2px;
  padding-left: 12px;
}

.app-tree-nav__form:hover {
  background: #f5f7fa;
  color: #303133;
}

.app-tree-nav__form.is-active {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 500;
}

.app-tree-nav__form-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-tree-nav__more {
  position: absolute;
  top: 50%;
  right: 2px;
  visibility: hidden;
  transform: translateY(-50%);
}

.app-tree-nav__dir .app-tree-nav__more {
  position: static;
  margin-left: auto;
  transform: none;
}

.app-tree-nav__dir:hover .app-tree-nav__more,
.app-tree-nav__form:hover .app-tree-nav__more,
.app-tree-nav__more-trigger:focus-visible {
  visibility: visible;
}

.app-tree-nav__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: #909399;
  cursor: pointer;
}

.app-tree-nav__more-trigger:hover {
  background: #ebeef5;
  color: #303133;
}

.app-tree-nav__empty {
  margin: 0 0 0 24px;
  color: #c0c4cc;
  font-size: 12px;
}

.app-tree-nav__foot {
  padding: 10px 12px 14px;
  border-top: 1px solid #f0f2f5;
}

.app-tree-nav__foot :deep(.el-dropdown) {
  display: block;
  width: 100%;
}

.app-tree-nav__foot :deep(.el-button) {
  width: 100%;
}
</style>
