<script setup lang="ts">
/**
 * AppGrid — 应用卡片网格唯一实现。
 *
 * 管理端应用管理与用户端应用中心共用同一卡片视觉：
 * 横向「图标 + 名称/表单数」，管理端额外叠加三点菜单与「新建应用」卡。
 * perRow 为空时按容器宽度自动铺排；传入时固定每行数量（用户端个人偏好）。
 */
import { Delete, Edit, MoreFilled } from '@element-plus/icons-vue'
import AppIcon from './AppIcon.vue'
import type { FormApp } from '@/contracts/app-center'
import { useI18n } from '@/locales'

withDefaults(
  defineProps<{
    apps: FormApp[]
    loading?: boolean
    perRow?: number | null
    showFormCount?: boolean
    showActions?: boolean
    showCreate?: boolean
    createLabel?: string
  }>(),
  {
    loading: false,
    perRow: null,
    showFormCount: false,
    showActions: false,
    showCreate: false,
    createLabel: '',
  },
)

const emit = defineEmits<{
  select: [app: FormApp]
  command: [command: string, app: FormApp]
  create: []
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-loading="loading"
    class="app-grid"
    :class="{ 'app-grid--fixed': perRow }"
    :style="perRow ? { '--per-row': perRow } : undefined"
  >
    <article v-for="app in apps" :key="app.id" class="app-grid__cell">
      <button
        type="button"
        class="app-grid__card"
        :class="{ 'app-grid__card--managed': showActions }"
        data-testid="app-card"
        @click="emit('select', app)"
      >
        <AppIcon :icon="app.icon" :color="app.color" :size="20" :box-size="36" soft />
        <span class="app-grid__body">
          <span class="app-grid__title">
            <span class="app-grid__name" data-testid="app-card-name" :title="app.name">
              {{ app.name }}
            </span>
            <el-tag v-if="app.status === 'DISABLED'" size="small" type="info">
              {{ t('form.appCenter.statusDisabled') }}
            </el-tag>
          </span>
          <span v-if="showFormCount && app.formCount !== undefined" class="app-grid__meta">
            {{ t('form.appCenter.formCount', { count: app.formCount }) }}
          </span>
        </span>
      </button>

      <el-dropdown
        v-if="showActions"
        class="app-grid__more"
        trigger="click"
        popper-class="app-card-op-menu"
        @command="(cmd: string) => emit('command', cmd, app)"
      >
        <button
          type="button"
          class="app-grid__more-trigger"
          data-testid="app-card-more"
          :aria-label="t('common.moreActions')"
          @click.stop
        >
          <el-icon><MoreFilled /></el-icon>
        </button>
        <template #dropdown>
          <!-- 273:1753（执行提示28 项2）：152 宽/项 36 高/带图标；删除项危险色，弹层随视口上下翻转（EP popper 默认语义） -->
          <el-dropdown-menu>
            <el-dropdown-item v-perm="'form:app:manage'" command="edit">
              <el-icon><Edit /></el-icon>{{ t('form.appCenter.editApp') }}
            </el-dropdown-item>
            <el-dropdown-item
              v-perm="'form:app:manage'"
              command="delete"
              divided
              class="app-card-op-menu__danger"
            >
              <el-icon><Delete /></el-icon>{{ t('form.appCenter.deleteApp') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </article>

    <button
      v-if="showCreate"
      v-perm="'form:app:manage'"
      type="button"
      class="app-grid__card app-grid__card--create"
      data-testid="app-create"
      @click="emit('create')"
    >
      <span class="app-grid__plus">+</span>
      <span class="app-grid__name">{{ createLabel || t('form.appCenter.newApp') }}</span>
    </button>

    <div v-if="apps.length === 0 && $slots.empty" class="app-grid__empty">
      <slot name="empty" />
    </div>
  </div>
</template>

<style scoped>
.app-grid {
  display: grid;
  align-content: start;
  align-items: start;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sw-space-16);
  min-height: 120px;
}

.app-grid--fixed {
  grid-template-columns: repeat(var(--per-row, 6), minmax(0, 1fr));
}

/* 窄屏不强按每行数量：避免卡片被压到不可用 */
@media (max-width: 767px) {
  .app-grid--fixed {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.app-grid__cell {
  position: relative;
  display: flex;
  min-width: 0;
}

.app-grid__card {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 88px;
  box-sizing: border-box;
  padding: 0 var(--sw-space-16);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  background: var(--sw-surface-card);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.app-grid__card--managed {
  padding-right: 40px;
}

.app-grid__card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.app-grid__card--create {
  border-style: dashed;
  background: #fafafa;
  color: #909399;
}

.app-grid__plus {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 28px;
  line-height: 1;
  color: #a8abb2;
}

.app-grid__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.app-grid__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.app-grid__name {
  overflow: hidden;
  color: var(--sw-text-primary);
  font-size: var(--sw-font-body);
  font-weight: 500;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-grid__meta {
  min-height: 16px;
  margin-top: var(--sw-space-4);
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: 18px;
}

.app-grid__more {
  position: absolute;
  top: var(--sw-space-8);
  right: var(--sw-space-8);
}

.app-grid__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--sw-radius-base);
  color: var(--sw-color-primary);
  cursor: pointer;
}

.app-grid__more-trigger:hover {
  background: #f5f7fa;
  color: #303133;
}

.app-grid__empty {
  grid-column: 1 / -1;
  color: #909399;
  text-align: center;
  padding: 48px 0;
}
</style>

<style>
/* 273:1753（执行提示28 项2）：应用卡操作菜单——teleport 浮层根按类定宽 152（含边框），
   项 36 高、图标同行；删除项危险色 #C2303A。本组件自包含（应用管理页不加载 AppTreeNav 的 sw-op-menu 样式）。 */
.app-card-op-menu.el-popper {
  box-sizing: border-box;
  width: 152px;
  padding: 0;
}
.app-card-op-menu .el-dropdown-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}
.app-card-op-menu .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  line-height: 36px;
  padding: 0 13px;
}
.app-card-op-menu .el-dropdown-menu__item .el-icon {
  margin-right: 0;
}
.app-card-op-menu .el-dropdown-menu__item--divided {
  margin: 0;
  border-top: none;
}
/* EP 的 divided 会额外插入一个空分隔 li；原图两项间无分隔线，行距由 gap 控制 */
.app-card-op-menu .el-dropdown-menu > li.el-dropdown-menu__item--divided:empty {
  display: none;
}
.app-card-op-menu .app-card-op-menu__danger {
  color: #c2303a;
}
.app-card-op-menu .app-card-op-menu__danger:not(.is-disabled):hover,
.app-card-op-menu .app-card-op-menu__danger:not(.is-disabled):focus {
  color: #c2303a;
  background-color: #fdf0f1;
}
</style>
