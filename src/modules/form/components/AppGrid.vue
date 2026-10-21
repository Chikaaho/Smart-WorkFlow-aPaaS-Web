<script setup lang="ts">
/**
 * AppGrid — 应用卡片网格唯一实现。
 *
 * 管理端应用管理与用户端应用中心共用同一卡片视觉：
 * 横向「图标 + 名称/表单数」，管理端额外叠加三点菜单与「新建应用」卡。
 * perRow 为空时按容器宽度自动铺排；传入时固定每行数量（用户端个人偏好）。
 */
import { MoreFilled } from '@element-plus/icons-vue'
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
        <AppIcon :icon="app.icon" :color="app.color" :size="20" />
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
        @command="(cmd: string) => emit('command', cmd, app)"
      >
        <span class="app-grid__more-trigger" data-testid="app-card-more" @click.stop>
          <el-icon><MoreFilled /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-perm="'form:app:manage'" command="edit">
              {{ t('common.edit') }}
            </el-dropdown-item>
            <el-dropdown-item v-perm="'form:app:manage'" command="delete" divided>
              {{ t('common.delete') }}
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
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
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
  padding: 16px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
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
  color: #303133;
  font-size: 15px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-grid__meta {
  min-height: 16px;
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
}

.app-grid__more {
  position: absolute;
  top: 6px;
  right: 6px;
}

.app-grid__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #909399;
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
