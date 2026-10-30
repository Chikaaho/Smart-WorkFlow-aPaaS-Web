<script setup lang="ts">
/* global document, window, HTMLElement, MouseEvent, Event */
/**
 * AppTreeNav — 应用目录/表单树唯一实现。
 *
 * 用户端应用内页与管理端应用工作台共用；页头与底部动作由宿主通过插槽提供，
 * 目录/表单管理菜单按 form:app:manage 权限显隐。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  CaretRight,
  DArrowLeft,
  DArrowRight,
  Document,
  Folder,
  FolderOpened,
  Grid,
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

/** 整栏收起（设计 272:1296）：收起后保留 64px 图标轨道，展开态按钮位于应用名行右端。 */
const navCollapsed = ref(false)

/* ── 收起态图标轨道与目录子树浮层（272:1296 / 710:44122） ── */

interface RailFlyout {
  key: string
  title: string
  top: number
  forms: FormAppFormItem[]
}

const railFlyout = ref<RailFlyout | null>(null)

function formsOfApp(): FormAppFormItem[] {
  const forms: FormAppFormItem[] = []
  for (const dir of props.dirs) forms.push(...(dir.forms ?? []))
  forms.push(...props.directForms)
  return forms
}

function toggleRailFlyout(key: string, title: string, forms: FormAppFormItem[], event: Event) {
  if (railFlyout.value?.key === key) {
    railFlyout.value = null
    return
  }
  const el = event.currentTarget as HTMLElement | null
  const anchorTop = el ? el.getBoundingClientRect().top : 64
  railFlyout.value = {
    key,
    title,
    forms,
    top: Math.max(8, Math.min(anchorTop, window.innerHeight - 160)),
  }
}

function pickFromRailFlyout(item: FormAppFormItem) {
  railFlyout.value = null
  emit('select', item)
}

function onDocumentClick(event: MouseEvent) {
  if (!railFlyout.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.app-tree-flyout') || target?.closest('.app-tree-rail')) return
  railFlyout.value = null
}

watch(navCollapsed, (value) => {
  if (!value) railFlyout.value = null
})

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <aside class="app-tree-nav" :class="{ 'is-collapsed': navCollapsed }">
    <template v-if="navCollapsed">
      <!-- 272:1296：收起态 64px 图标轨道，应用/目录入口与折叠底栏可达 -->
      <div class="app-tree-rail">
        <button
          type="button"
          class="app-tree-rail__item"
          data-testid="app-tree-rail-app"
          :title="appName || t('form.appCenter.appNavTitle')"
          :aria-label="appName || t('form.appCenter.appNavTitle')"
          @click="
            toggleRailFlyout(
              'app',
              appName || t('form.appCenter.appNavTitle'),
              formsOfApp(),
              $event,
            )
          "
        >
          <el-icon :size="18"><Grid /></el-icon>
        </button>
        <button
          v-for="dir in dirs"
          :key="dir.id"
          type="button"
          class="app-tree-rail__item"
          :class="{ 'is-open': railFlyout?.key === 'dir:' + dir.id }"
          :data-testid="'app-tree-rail-dir-' + dir.id"
          :title="dir.name"
          :aria-label="dir.name"
          :aria-expanded="railFlyout?.key === 'dir:' + dir.id"
          @click="toggleRailFlyout('dir:' + dir.id, dir.name, dir.forms ?? [], $event)"
        >
          <el-icon :size="18">
            <FolderOpened v-if="(dir.forms?.length ?? 0) > 0" />
            <Folder v-else />
          </el-icon>
        </button>
        <button
          v-for="item in directForms"
          :key="item.formId"
          type="button"
          class="app-tree-rail__item"
          :class="{ 'is-active': item.formKey === selectedFormKey }"
          :data-testid="'app-tree-rail-form-' + item.formKey"
          :title="item.name"
          :aria-label="item.name"
          @click="emit('select', item)"
        >
          <el-icon :size="18"><Document /></el-icon>
        </button>
      </div>
      <div class="app-tree-rail__foot">
        <button
          type="button"
          class="app-tree-rail__expand"
          data-testid="app-tree-nav-expand"
          :title="t('form.appCenter.expandNav')"
          :aria-label="t('form.appCenter.expandNav')"
          @click="navCollapsed = false"
        >
          <el-icon :size="18"><DArrowRight /></el-icon>
        </button>
      </div>
      <!-- 710:44122：目录/应用子树浮层（x72/w256，标题 14/22/500/#172033，子项 44 步长） -->
      <Teleport to="body">
        <div
          v-if="railFlyout"
          class="app-tree-flyout"
          :style="{ top: railFlyout.top + 'px' }"
          role="menu"
          :aria-label="railFlyout.title"
        >
          <div class="app-tree-flyout__header">{{ railFlyout.title }}</div>
          <div class="app-tree-flyout__body">
            <button
              v-for="item in railFlyout.forms"
              :key="item.formId"
              type="button"
              class="app-tree-flyout__item"
              :class="{ 'is-active': item.formKey === selectedFormKey }"
              role="menuitem"
              :data-testid="'app-tree-flyout-form-' + item.formKey"
              @click="pickFromRailFlyout(item)"
            >
              <el-icon :size="18"><Document /></el-icon>
              <span>{{ item.name }}</span>
            </button>
            <p v-if="railFlyout.forms.length === 0" class="app-tree-flyout__empty">
              {{ t('form.appCenter.emptyDir') }}
            </p>
          </div>
        </div>
      </Teleport>
    </template>

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
                  <el-dropdown-item command="delete" class="sw-op-menu__danger">
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
                      <el-icon><Edit /></el-icon>{{ t('common.rename') }}
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" class="sw-op-menu__danger">
                      <el-icon><Delete /></el-icon>{{ t('form.appCenter.deleteFormMenu') }}
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
                  <el-icon><Edit /></el-icon>{{ t('common.rename') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" class="sw-op-menu__danger">
                  <el-icon><Delete /></el-icon>{{ t('form.appCenter.deleteFormMenu') }}
                </el-dropdown-item>
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

/* 272:1296：收起态保留 64px 图标轨道（主区筛选随之为 x84） */
.app-tree-nav.is-collapsed {
  flex: 0 0 64px;
  width: 64px;
  border-right: none;
  background: #fff;
}

.app-tree-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.app-tree-rail__item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  color: #909399;
  cursor: pointer;
}

.app-tree-rail__item:hover {
  background: #f5f7fa;
  color: #303133;
}

.app-tree-rail__item.is-open,
.app-tree-rail__item.is-active {
  background: #ecf5ff;
  color: #409eff;
}

.app-tree-rail__foot {
  display: flex;
  justify-content: center;
  margin-top: auto;
  padding: 12px 0;
  border-top: 1px solid #f0f2f5;
}

.app-tree-rail__expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #606266;
  cursor: pointer;
}

.app-tree-rail__expand:hover {
  color: var(--sw-color-primary, #409eff);
  background: #f5f7fa;
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
/* 273:1709/1731（执行提示18）：菜单外盒 192×122（含边框）、项 182×36/首项 top5/步长38、危险 #C2303A */
.sw-op-menu.el-popper {
  box-sizing: border-box;
  width: 192px;
  padding: 0;
}
.sw-op-menu .el-dropdown-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}
.sw-op-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  line-height: 36px;
  padding: 0 13px;
}
.sw-op-menu .el-dropdown-menu__item .el-icon {
  margin-right: 0;
}
.sw-op-menu .el-dropdown-menu__item--divided {
  margin: 0;
  border-top: none;
}
/* EP 的 divided 会额外插入一个空分隔 li（无内容），行距已由 gap 控制 */
.sw-op-menu .el-dropdown-menu > li.el-dropdown-menu__item--divided:empty {
  display: none;
}
.sw-op-menu .sw-op-menu__danger {
  color: #c2303a;
}
.sw-op-menu .sw-op-menu__danger:not(.is-disabled):hover,
.sw-op-menu .sw-op-menu__danger:not(.is-disabled):focus {
  color: #c2303a;
  background-color: #fdf0f1;
}

/* 710:44122：应用目录子树浮层 x72/w256、标题 14/22/500/#172033、子项 44 步长 */
.app-tree-flyout {
  position: fixed;
  left: 72px;
  z-index: 2000;
  box-sizing: border-box;
  width: 256px;
  background: #fff;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.app-tree-flyout__header {
  box-sizing: border-box;
  height: 44px;
  padding: 11px 10px;
  color: #172033;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-tree-flyout__body {
  padding: 0 8px 8px;
}
.app-tree-flyout__item {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 0 10px 0 16px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #303133;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.app-tree-flyout__item > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-tree-flyout__item:hover {
  background: #f5f7fa;
}
.app-tree-flyout__item.is-active {
  background: #eff6ff;
  color: #2563eb;
  box-shadow: inset 3px 0 0 #2563eb;
}
.app-tree-flyout__empty {
  margin: 0;
  padding: 10px 16px;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
