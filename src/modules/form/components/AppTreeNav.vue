<script setup lang="ts">
/**
 * AppTreeNav — 应用目录/表单树唯一实现。
 *
 * 用户端应用内页与管理端应用工作台共用；页头与底部动作由宿主通过插槽提供，
 * 目录/表单管理菜单按 form:app:manage 权限显隐。
 */
import { computed, ref } from 'vue'
import {
  ArrowLeft,
  CaretRight,
  DArrowLeft,
  DArrowRight,
  Folder,
  MoreFilled,
  Edit,
  Plus,
  Delete,
  EditPen,
} from '@element-plus/icons-vue'
import type { FormAppDir, FormAppFormItem } from '@/contracts/app-center'
import { hasPerm } from '@/foundation/permission'
import { useI18n } from '@/locales'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    dirs: FormAppDir[]
    directForms: FormAppFormItem[]
    selectedFormKey: string
    /** 应用身份：名称/图标/主题色，页头统一渲染（管理端与用户端一致）。 */
    appName?: string
    appIcon?: string | null
    appColor?: string | null
    /** 返回按钮文案；不传则不渲染返回按钮。 */
    backTitle?: string
    backTestId?: string
    nameTestId?: string
  }>(),
  {
    appName: '',
    appIcon: null,
    appColor: null,
    backTitle: '',
    backTestId: 'app-tree-back',
    nameTestId: 'app-tree-name',
  },
)

const emit = defineEmits<{
  select: [item: FormAppFormItem]
  back: []
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

/** 整栏收起（设计 272:1296）：收起后左缘保留浮动展开按钮，展开态按钮位于应用名行右端。 */
const navCollapsed = ref(false)
</script>

<template>
  <aside class="app-tree-nav" :class="{ 'is-collapsed': navCollapsed }">
    <button
      v-if="navCollapsed"
      type="button"
      class="app-tree-nav__expander"
      data-testid="app-tree-nav-expand"
      :title="t('form.appCenter.expandNav')"
      :aria-label="t('form.appCenter.expandNav')"
      @click="navCollapsed = false"
    >
      <el-icon><DArrowRight /></el-icon>
    </button>

    <template v-else>
      <div v-if="backTitle || appName" class="app-tree-nav__head">
        <button
          v-if="backTitle"
          type="button"
          class="app-tree-nav__back"
          :data-testid="backTestId"
          :title="backTitle"
          @click="emit('back')"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <template v-if="appName">
          <AppIcon
            class="app-tree-nav__app-icon"
            :icon="props.appIcon"
            :color="props.appColor"
            :size="13"
          />
          <span class="app-tree-nav__app-name" :data-testid="nameTestId" :title="appName">
            {{ appName }}
          </span>
        </template>
        <button
          type="button"
          class="app-tree-nav__collapse"
          data-testid="app-tree-nav-collapse"
          :title="t('form.appCenter.collapseNav')"
          :aria-label="t('form.appCenter.collapseNav')"
          @click="navCollapsed = true"
        >
          <el-icon><DArrowLeft /></el-icon>
        </button>
      </div>

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
              popper-class="sw-op-menu"
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
                  <el-dropdown-item command="rename">
                    <el-icon><Edit /></el-icon>{{ t('common.edit') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="form">
                    <el-icon><Plus /></el-icon>{{ t('form.appCenter.newFormInDir') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="sw-op-menu__danger">
                    <el-icon><Delete /></el-icon>{{ t('common.delete') }}
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
                popper-class="sw-op-menu"
                @command="(cmd: string) => emit('form-command', cmd, item)"
              >
                <span class="app-tree-nav__more-trigger" @click.stop>
                  <el-icon><MoreFilled /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="design">
                      <el-icon><EditPen /></el-icon>{{ t('form.appCenter.enterFormDesign') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="rename">
                      <el-icon><Edit /></el-icon>{{ t('common.edit') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided class="sw-op-menu__danger">
                      <el-icon><Delete /></el-icon>{{ t('common.delete') }}
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
                <el-dropdown-item command="delete" divided>{{
                  t('common.delete')
                }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </button>
      </nav>

      <div v-if="$slots.footer" class="app-tree-nav__foot">
        <slot name="footer" />
      </div>
    </template>
  </aside>
</template>

<style scoped>
/* 272:851（执行提示17）：应用内数据页展开侧栏 236 */
.app-tree-nav {
  display: flex;
  flex: 0 0 236px;
  flex-direction: column;
  width: 236px;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #ebeef5;
}

/* 整栏收起：面板隐藏为 0 宽，仅保留左缘浮动展开按钮（设计 272:1296） */
.app-tree-nav.is-collapsed {
  flex-basis: 0;
  width: 0;
  border-right: none;
  position: relative;
}

.app-tree-nav__expander {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  border: 1px solid #e4e7ed;
  border-left: none;
  border-radius: 0 6px 6px 0;
  background: #fff;
  color: #606266;
  cursor: pointer;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
}

.app-tree-nav__expander:hover {
  color: var(--sw-color-primary, #409eff);
}

.app-tree-nav__collapse {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: auto;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #909399;
  cursor: pointer;
}

.app-tree-nav__collapse:hover {
  color: #303133;
  background: #f5f7fa;
}

.app-tree-nav__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid #f0f2f5;
}

.app-tree-nav__back {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fff;
  color: #606266;
  cursor: pointer;
}

.app-tree-nav__back:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}

/* 应用名称只展示 5 个字，超长省略号（完整名称走 title 悬浮）。
   6em = 5 个全角字 + 1 个省略号位：刚好 5 字时不截断，超长时稳定呈现「5 字 + …」 */
.app-tree-nav__app-icon {
  flex: 0 0 auto;
}

.app-tree-nav__app-name {
  max-width: 6em;
  overflow: hidden;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
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

<style>
/* 273:1709/1731（执行提示17）：目录/表单操作菜单 192 宽、行 38、左图标、危险项红 */
.sw-op-menu {
  width: 192px;
}
.sw-op-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  line-height: 38px;
  padding: 0 16px;
}
.sw-op-menu .el-dropdown-menu__item .el-icon {
  margin-right: 0;
}
.sw-op-menu .sw-op-menu__danger {
  color: #d93026;
}
.sw-op-menu .sw-op-menu__danger:not(.is-disabled):hover,
.sw-op-menu .sw-op-menu__danger:not(.is-disabled):focus {
  color: #d93026;
  background-color: #fdf0f1;
}
</style>
