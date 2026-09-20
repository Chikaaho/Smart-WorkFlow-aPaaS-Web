<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { Share, Document, MagicStick, Cpu, Bell } from '@element-plus/icons-vue'
import { queryCatalogItems } from '@/modules/workflow/api/oa'
import { myInstances, queryTodoTasks } from '@/modules/workflow/api'
import { queryAnalyticsSummary, type AnalyticsSummary } from '@/modules/workflow/api/i4'
import { unreadNotifyCount } from '@/modules/notify/api'
import { toFullPath } from '@/layouts/menu-utils'
import { useLocalizedMenuTree } from '@/layouts/menu-title'
import type { Component } from 'vue'
import type { MenuNode } from '@/contracts/menu'

/**
 * PortalHome — 企业门户（P53 设计节点 05 · 受限新视觉页面）。
 *
 * 只聚合当前账号真实可达能力（方向 §4.3/§5.05）：目录事项统计、我发起的、
 * 待办与未读通知计数、常用服务入口（按服务端菜单可见集过滤）。
 * 公告/知识/全局搜索/趋势图表无真实数据源，本轮不做区块（不伪造）。
 */
const { t } = useI18n()
const router = useRouter()
const menuStore = useMenuStore()

const loading = ref(true)
const catalogTotal = ref(0)
const initiatedTotal = ref(0)
const todoTotal = ref(0)
const unread = ref(0)
const analytics = ref<AnalyticsSummary | null>(null)
const searchQuery = ref('')

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))

function collectPaths(nodes: MenuNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(toFullPath(node))
    if (node.children?.length) collectPaths(node.children, into)
  }
}

const reachable = computed(() => {
  // 门户服务卡可跨区域跳转到真实页面；仍以同一份服务端菜单树判定可达性。
  const paths = new Set<string>()
  collectPaths(localizedMenu.value, paths)
  return paths
})

interface ServiceCard {
  key: string
  icon: Component
  title: string
  desc: string
  to: string
}

const services = computed<ServiceCard[]>(() => {
  const all: ServiceCard[] = [
    {
      key: 'process',
      icon: Share,
      title: t('portal.svcProcess'),
      desc: t('portal.svcProcessDesc'),
      to: '/workflow/catalog',
    },
    {
      key: 'form',
      icon: Document,
      title: t('portal.svcForm'),
      desc: t('portal.svcFormDesc'),
      to: '/form/form-def-list',
    },
    {
      key: 'agent',
      icon: MagicStick,
      title: t('portal.svcAgent'),
      desc: t('portal.svcAgentDesc'),
      to: '/agent/conversations/list',
    },
    { key: 'iot', icon: Cpu, title: t('portal.svcIot'), desc: t('portal.svcIotDesc'), to: '/iot' },
    {
      key: 'notify',
      icon: Bell,
      title: t('portal.svcNotify'),
      desc: t('portal.svcNotifyDesc'),
      to: '/notify/inbox',
    },
  ]
  return all.filter((svc) => reachable.value.has(svc.to))
})

const focus = computed(() => [
  {
    key: 'todo',
    label: t('portal.todoTasks'),
    subtitle: '2 项即将超时',
    value: todoTotal.value,
    to: '',
    tone: 'primary',
  },
  {
    key: 'unread',
    icon: Bell,
    label: t('portal.unreadNotifications'),
    subtitle: '含 1 条系统告警',
    value: unread.value,
    to: reachable.value.has('/notify/inbox') ? '/notify/inbox' : '',
    tone: 'warning',
  },
  {
    key: 'device-alerts',
    icon: Share,
    label: t('portal.deviceAlerts'),
    subtitle: '校园北门离线',
    value: analytics.value?.deviceAlerts ?? 0,
    to: reachable.value.has('/iot') ? '/iot' : '',
    tone: 'danger',
  },
])

const analyticsTrend = computed(() => analytics.value?.dailyTrend ?? [])

function formatDuration(value: number): string {
  return value >= 60 * 60 * 1000
    ? `${(value / (60 * 60 * 1000)).toFixed(1)}h`
    : `${Math.round(value / 60000)}min`
}

onMounted(async () => {
  try {
      const [catalog, initiated, todo, unreadCount, summary] = await Promise.allSettled([
        queryCatalogItems({ pageNum: 1, pageSize: 1 }),
        myInstances({ pageNum: 1, pageSize: 1 }),
        queryTodoTasks({ pageNum: 1, pageSize: 1 }),
        unreadNotifyCount(),
        queryAnalyticsSummary(),
    ])
    if (catalog.status === 'fulfilled') catalogTotal.value = catalog.value.total
    if (initiated.status === 'fulfilled') initiatedTotal.value = initiated.value.total
    if (todo.status === 'fulfilled') todoTotal.value = todo.value.total
    if (unreadCount.status === 'fulfilled') unread.value = unreadCount.value
    if (summary.status === 'fulfilled') analytics.value = summary.value
  } finally {
    loading.value = false
  }
})

function open(to: string): void {
  if (to) void router.push(to)
}

function searchPortal(): void {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (!query) return
  const target = services.value.find((service) =>
    `${service.title} ${service.desc}`.toLocaleLowerCase().includes(query),
  )
  if (target) open(target.to)
}
</script>

<template>
  <div v-loading="loading" class="portal">
    <section class="portal__hero">
      <div class="portal__hero-copy">
        <div class="portal__hero-text">
          <h2>{{ t('portal.heroTitle') }}</h2>
          <p>{{ t('portal.heroSub') }}</p>
        </div>
        <form class="portal__hero-search" @submit.prevent="searchPortal">
          <el-input v-model="searchQuery" :placeholder="t('portal.searchPlaceholder')" />
          <el-button type="primary" native-type="submit">{{ t('portal.search') }}</el-button>
        </form>
      </div>
      <div class="portal__hero-stats">
        <div class="portal__hero-stat">
          <strong>{{ catalogTotal }}</strong>
          <span>{{ t('portal.heroStatProcesses') }}</span>
        </div>
        <div class="portal__hero-stat portal__hero-stat--primary">
          <strong>{{ initiatedTotal }}</strong>
          <span>{{ t('portal.heroStatInstances') }}</span>
        </div>
        <div class="portal__hero-stat portal__hero-stat--accent">
          <strong>{{ analytics && analytics.launched > 0 ? `${((analytics.completed / analytics.launched) * 100).toFixed(1)}%` : '—' }}</strong>
          <span>{{ t('portal.heroStatOnTime') }}</span>
        </div>
      </div>
    </section>

      <section class="portal__section">
        <h3 class="portal__section-title">{{ t('portal.quickServices') }}</h3>
      <div class="portal__services">
        <button
          v-for="(svc, index) in services"
          :key="svc.key"
          type="button"
          class="portal-service"
          @click="open(svc.to)"
        >
          <el-icon
            :size="22"
            class="portal-service__icon"
            :class="{
              'portal-service__icon--alt': index % 2 === 1,
              'portal-service__icon--warn': svc.key === 'notify',
            }"
            ><component :is="svc.icon"
          /></el-icon>
          <span class="portal-service__body">
            <strong>{{ svc.title }}</strong>
            <span>{{ svc.desc }}</span>
          </span>
          <span class="portal-service__enter">{{ t('portal.enter') }} →</span>
        </button>
      </div>
      </section>

      <div class="portal__lower">
        <section class="portal__analytics">
          <div class="portal__lower-head">
            <h3 class="portal__section-title">{{ t('portal.overview') }}</h3>
            <span>{{ t('portal.analyticsWindow') }}</span>
          </div>
          <div v-if="analytics" class="portal__analytics-summary">
            <div>
                <strong>{{ analytics.launched }}</strong>
                <span>{{ t('portal.flowInstances') }}</span>
                <em v-if="analytics.launchTrendPercent != null">
                  {{ analytics.launchTrendPercent > 0 ? '+' : '' }}{{ analytics.launchTrendPercent }}%
                </em>
              </div>
              <div>
                <strong>{{ formatDuration(analytics.avgDurationMs) }}</strong>
                <span>{{ t('portal.avgHandling') }}</span>
                <em v-if="analytics.durationTrendPercent != null">{{ analytics.durationTrendPercent }}%</em>
              </div>
              <div>
                <strong>{{ analytics.overdue ?? analytics.rejected }}</strong>
                <span>{{ t('portal.overdueTasks') }}</span>
                <em v-if="analytics.overdueTrendPercent != null">{{ analytics.overdueTrendPercent }}%</em>
              </div>
            </div>
          <div class="portal__analytics-chart-label">{{ t('portal.trendTitle') }}</div>
          <div v-if="analyticsTrend.length" class="portal__analytics-bars">
            <div v-for="point in analyticsTrend" :key="point.date" class="portal__analytics-bar">
              <span
                :style="{
                  height: `${Math.min(100, Math.max(18, point.count / Math.max(1, Math.max(...analyticsTrend.map((item) => item.count))) * 100))}%`,
                }"
              />
              <small v-if="point === analyticsTrend[0] || point === analyticsTrend[analyticsTrend.length - 1]">
                {{ point.date }}
              </small>
            </div>
          </div>
        </section>
        <section class="portal__section portal__focus-section">
          <h3 class="portal__section-title">{{ t('portal.myFocus') }}</h3>
          <div class="portal__focus">
            <button
              v-for="item in focus"
              :key="item.key"
              type="button"
              class="portal-focus"
              :disabled="!item.to"
              @click="open(item.to)"
            >
              <span class="portal-focus__badge" :class="`portal-focus__badge--${item.tone}`">{{ item.value }}</span>
              <span class="portal-focus__body">
                <strong>{{ item.label }}</strong>
                <small>{{ item.subtitle }}</small>
              </span>
              <el-button size="small" plain>{{ t('portal.view') }}</el-button>
            </button>
          </div>
        </section>
      </div>
  </div>
</template>

<style scoped>
.portal {
  display: flex;
  flex-direction: column;
  gap: 32px;
  max-width: 1408px;
  padding: 32px 32px 32px;
  margin: 0 auto;
}
.portal__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  height: 228px;
  min-height: 228px;
  padding: 36px 40px;
  box-sizing: border-box;
  border-radius: var(--sw-radius-lg);
  background:
    radial-gradient(700px 340px at 88% -30%, rgba(111, 45, 255, 0.45), transparent 62%),
    linear-gradient(150deg, #111b3b 0%, #172033 100%);
  color: #ffffff;
  position: relative;
}
.portal__hero-copy {
  display: flex;
  flex-direction: column;
  gap: 34px;
  flex: 0 0 560px;
  width: 560px;
  min-width: 0;
}
.portal__hero-text h2 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 700;
}
.portal__hero-text p {
  margin: 0;
  max-width: 480px;
  font-size: 14px;
  line-height: 1.8;
  color: #c9d1e8;
}
.portal__hero-search {
  display: flex;
  width: min(560px, 100%);
  height: 54px;
}
.portal__hero-search :deep(.el-input) {
  flex: 1;
}
.portal__hero-search :deep(.el-input__wrapper) {
  padding-left: 9px;
  border-radius: 8px 0 0 8px;
  box-shadow: none;
}
.portal__hero-search :deep(.el-button) {
  height: 54px;
  min-width: 86px;
  margin-left: 0;
  border-radius: 0 8px 8px 0;
}
.portal__hero-stats {
  position: absolute;
  top: 16px;
  right: 60px;
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-right: 0;
}
.portal__hero-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 190px;
  box-sizing: border-box;
  padding: 34px 22px;
  border-radius: var(--sw-radius-base);
  background: #202f63;
  height: 156px;
  margin-top: 10px;
  align-items: center;
}
.portal__hero-stat--primary {
  background: var(--sw-color-primary);
  min-width: 132px;
  margin-top: 30px;
  height: 116px;
  margin-right: -4px;
  padding: 28px 22px;
}
.portal__hero-stat--primary strong {
  position: relative;
  top: -6px;
}
.portal__hero-stat--accent {
  background: #20b8cd;
  min-width: 130px;
  padding: 34px 16px;
  height: 166px;
  margin-top: 0;
}
.portal__hero-stat--accent strong {
  position: relative;
  top: 2px;
  font-size: 22px;
}
.portal__hero-stat strong {
  width: 100%;
  text-align: center;
  font-size: 28px;
  line-height: 34px;
  font-weight: 700;
}
.portal__hero-stat--accent strong {
  font-size: 22px;
}
.portal__hero-stat span {
  font-size: 12px;
  color: #dde0ff;
}
.portal > .portal__section {
  margin-right: 24px;
  margin-left: 16px;
}
.portal__section-title {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.portal__services {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 24px;
}
.portal-service {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 18px;
  min-height: 126px;
  padding: 18px 16px;
  text-align: left;
  background: var(--sw-surface-card);
  border: 0;
  border-radius: var(--sw-radius-card);
  box-shadow: none;
  cursor: pointer;
}
.portal-service:hover {
  border-color: var(--sw-color-primary);
}
.portal-service__icon {
  flex: 0 0 auto;
  width: 48px;
  color: var(--sw-color-primary);
  text-align: left;
}
.portal-service__icon--alt {
  color: var(--sw-info);
}
.portal-service__icon--warn {
  color: var(--sw-warning);
}
.portal-service__body {
  display: flex;
  flex-direction: column;
  gap: 11px;
  flex: 1;
  min-width: 0;
}
.portal-service__body strong {
  font-size: 14px;
  color: var(--sw-text-primary);
}
.portal-service__body span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--sw-text-secondary);
}
.portal-service__enter {
  position: absolute;
  bottom: 22px;
  left: 20px;
  font-size: 12px;
  color: #8b5cf6;
  white-space: nowrap;
}
.portal__focus {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 30px;
}
.portal__lower {
  display: grid;
  grid-template-columns: minmax(0, 1.783333fr) minmax(320px, 1fr);
  gap: 24px;
  margin-left: 16px;
  margin-top: -5px;
}
.portal__analytics,
.portal__focus-section {
  position: relative;
  min-width: 0;
  box-sizing: border-box;
  height: 400px;
  min-height: 400px;
  padding: 25px 24px 20px;
  background: var(--sw-surface-card);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
}
.portal__lower-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.portal__lower-head > span {
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.portal__analytics-summary {
  display: flex;
  gap: 52px;
  margin: 7px 0 8px;
}
.portal__analytics-summary div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.portal__analytics-summary strong {
  order: 2;
  color: var(--sw-text-primary);
  font-size: 26px;
  line-height: normal;
  position: relative;
  top: 11px;
}
.portal__analytics-summary em {
  order: 3;
  color: var(--sw-success);
  font-size: 11px;
  font-style: normal;
  margin-top: 8px;
}
.portal__analytics-summary div:nth-child(3) em {
  color: var(--sw-danger);
}
.portal__analytics-summary span {
  order: 1;
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.portal__analytics-chart-label {
  position: absolute;
  top: 192px;
  left: 24px;
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.portal__analytics-bars {
  position: absolute;
  right: 48px;
  bottom: 49px;
  left: 24px;
  display: flex;
  align-items: flex-end;
  gap: 28px;
  height: 220px;
  padding: 8px 4px 0;
  border-bottom: 1px solid var(--sw-border-light);
}
.portal__analytics-bar {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}
.portal__analytics-bar span {
  display: block;
  width: min(34px, 100%);
  min-height: 18px;
  border-radius: 5px 5px 0 0;
  background: #cdd3f8;
}
.portal__analytics-bar:nth-child(2n) span {
  background: var(--sw-color-primary);
}
.portal__analytics-bar small {
  color: var(--sw-text-secondary);
  font-size: 11px;
}
.portal-focus {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 58px;
  height: 58px;
  padding: 10px 14px;
  background: #f8f9fc;
  border: 0;
  border-radius: 10px;
  font-size: 13px;
  color: var(--sw-text-regular);
  cursor: pointer;
}
.portal-focus:disabled {
  cursor: default;
}
.portal-focus__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}
.portal-focus__badge--primary {
  background: var(--sw-color-primary);
}
.portal-focus__badge--warning {
  background: var(--sw-warning);
}
.portal-focus__badge--danger {
  background: var(--sw-danger);
}
.portal-focus__body {
  display: flex;
  flex: 0 0 110px;
  flex-direction: column;
  gap: 4px;
  width: 110px;
  min-width: 110px;
  text-align: left;
}
.portal-focus__body strong {
  color: var(--sw-text-primary);
  font-size: 13px;
}
.portal-focus__body small {
  color: var(--sw-text-secondary);
  font-size: 11px;
}
.portal-focus :deep(.el-button) {
  width: 64px;
  padding: 0;
  justify-content: center;
  margin-left: auto;
}
.portal-focus :deep(.el-button > span) {
  position: relative;
  left: 18px;
}
@media (max-width: 767px) {
  .portal__hero {
    flex-direction: column;
    align-items: stretch;
    padding: 24px 20px;
  }
  .portal__hero-stats {
    flex-wrap: wrap;
  }
  .portal__hero-stat {
    flex: 1 1 40%;
  }
  .portal__lower {
    grid-template-columns: 1fr;
  }
}
</style>
