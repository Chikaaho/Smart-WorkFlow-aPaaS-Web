<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { queryCatalogItems } from '@/modules/workflow/api/oa'
import { myInstances, queryTodoTasks } from '@/modules/workflow/api'
import { queryAnalyticsSummary, type AnalyticsSummary } from '@/modules/workflow/api/i4'
import { unreadNotifyCount } from '@/modules/notify/api'
import { toFullPath } from '@/layouts/menu-utils'
import { useLocalizedMenuTree } from '@/layouts/menu-title'
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
  title: string
  desc: string
  to: string
}

const services = computed<ServiceCard[]>(() => {
  const all: ServiceCard[] = [
    {
      key: 'process',
      title: t('portal.svcProcess'),
      desc: t('portal.svcProcessDesc'),
      to: '/workflow/catalog',
    },
    {
      key: 'form',
      title: t('portal.svcForm'),
      desc: t('portal.svcFormDesc'),
      to: '/form/form-def-list',
    },
    {
      key: 'agent',
      title: t('portal.svcAgent'),
      desc: t('portal.svcAgentDesc'),
      to: '/agent/conversations/list',
    },
    { key: 'iot', title: t('portal.svcIot'), desc: t('portal.svcIotDesc'), to: '/iot' },
    {
      key: 'notify',
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
    subtitle: todoTotal.value
      ? t('portal.focusTodoCount', { count: todoTotal.value })
      : t('portal.focusNoTodo'),
    value: todoTotal.value,
    to: '/workflow/todo',
  },
  {
    key: 'unread',
    label: t('portal.unreadNotifications'),
    subtitle: unread.value
      ? t('portal.focusUnreadCount', { count: unread.value })
      : t('portal.focusNoUnread'),
    value: unread.value,
    to: reachable.value.has('/notify/inbox') ? '/notify/inbox' : '',
  },
  {
    key: 'device-alerts',
    label: t('portal.deviceAlerts'),
    subtitle:
      (analytics.value?.deviceAlerts ?? 0)
        ? t('portal.focusDeviceCount', { count: analytics.value?.deviceAlerts ?? 0 })
        : t('portal.focusNoDevice'),
    value: analytics.value?.deviceAlerts ?? 0,
    to: reachable.value.has('/iot') ? '/iot' : '',
  },
])

const analyticsTrend = computed(() => analytics.value?.dailyTrend ?? [])

/**
 * 参考 7:2 趋势为 14 根等宽柱（13 浅色 + 末根深色），而接口给的是 30 个逐日值；
 * 按索引把真实日值合并为 14 段（每段连续 2~3 天，合计 30 天），不新增后端口径。
 */
const TREND_BAR_COUNT = 14
const analyticsTrendBuckets = computed(() => {
  const points = analyticsTrend.value
  if (!points.length) return []
  const bucketCount = Math.min(TREND_BAR_COUNT, points.length)
  const buckets: { count: number; start: string; end: string }[] = []
  for (let index = 0; index < bucketCount; index++) {
    const start = Math.floor((index * points.length) / bucketCount)
    const end = Math.max(start + 1, Math.floor(((index + 1) * points.length) / bucketCount))
    const slice = points.slice(start, end)
    buckets.push({
      count: slice.reduce((sum, point) => sum + point.count, 0),
      start: slice[0]?.date ?? '',
      end: slice[slice.length - 1]?.date ?? '',
    })
  }
  return buckets
})
const trendMax = computed(() =>
  Math.max(1, ...analyticsTrendBuckets.value.map((bucket) => bucket.count)),
)
const trendStartLabel = computed(() => analyticsTrendBuckets.value[0]?.start ?? '')
const trendEndLabel = computed(
  () => analyticsTrendBuckets.value[analyticsTrendBuckets.value.length - 1]?.end ?? '',
)

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
  <div class="portal" :aria-busy="loading">
    <section class="portal__hero">
      <div class="portal__hero-copy">
        <div class="portal__hero-text">
          <h2>{{ t('portal.heroTitle') }}</h2>
        </div>
        <form class="portal__hero-search" @submit.prevent="searchPortal">
          <span class="portal__hero-search-label">{{ t('portal.serviceLabel') }}</span>
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
          <strong>{{
            analytics && analytics.launched > 0
              ? `${Math.round((analytics.completed / analytics.launched) * 100)}%`
              : '—'
          }}</strong>
          <span>{{ t('portal.heroStatOnTime') }}</span>
        </div>
      </div>
    </section>

    <section class="portal__section">
      <h3 class="portal__section-title">{{ t('portal.quickServices') }}</h3>
      <div class="portal__services">
        <button
          v-for="svc in services"
          :key="svc.key"
          type="button"
          class="portal-service"
          @click="open(svc.to)"
        >
          <span class="portal-service__body">
            <strong>{{ svc.title }}</strong>
            <span>{{ svc.desc }}</span>
          </span>
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
            <span>{{ t('portal.flowInstances') }}</span>
            <strong>{{ analytics.launched }}</strong>
            <em v-if="analytics.launchTrendPercent != null">
              {{ analytics.launchTrendPercent > 0 ? '+' : '' }}{{ analytics.launchTrendPercent }}%
            </em>
          </div>
          <div>
            <span>{{ t('portal.avgHandling') }}</span>
            <strong>{{ formatDuration(analytics.avgDurationMs) }}</strong>
            <em v-if="analytics.durationTrendPercent != null"
              >{{ analytics.durationTrendPercent }}%</em
            >
          </div>
          <div>
            <span>{{ t('portal.overdueTasks') }}</span>
            <strong>{{ analytics.overdue ?? analytics.rejected }}</strong>
            <em v-if="analytics.overdueTrendPercent != null"
              >{{ analytics.overdueTrendPercent }}%</em
            >
          </div>
        </div>
        <div class="portal__analytics-chart-label">{{ t('portal.trendTitle') }}</div>
        <div v-if="analyticsTrendBuckets.length" class="portal__analytics-bars">
          <div
            v-for="(bucket, index) in analyticsTrendBuckets"
            :key="index"
            class="portal__analytics-bar"
          >
            <span
              :style="{
                height: `${Math.min(100, Math.max(18, (bucket.count / trendMax) * 100))}%`,
              }"
            />
          </div>
        </div>
        <!-- 参考 7:2：日期只在柱形区首末各一个，左端贴齐图表左缘、右端贴齐右缘 -->
        <div v-if="analyticsTrendBuckets.length" class="portal__analytics-dates">
          <small>{{ trendStartLabel }}</small>
          <small>{{ trendEndLabel }}</small>
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
            <span class="portal-focus__badge">{{ item.value }}</span>
            <span class="portal-focus__body">
              <strong>{{ item.label }}</strong>
              <small>{{ item.subtitle }}</small>
            </span>
            <span class="portal-focus__view">{{ t('portal.view') }}</span>
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
  gap: 16px;
  max-width: none !important;
  padding: 20px;
  margin: 0 auto;
}
.portal__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  height: 144px;
  min-height: 144px;
  padding: 24px;
  box-sizing: border-box;
  border-radius: var(--sw-radius-lg);
  background: var(--sw-surface-card);
  border: 0;
  box-shadow: none;
  color: var(--sw-text-primary);
  position: relative;
}
.portal__hero-copy {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 0 1 1034px;
  width: min(1034px, 58%);
  min-width: 0;
}
.portal__hero-text h2 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}
.portal__hero-text p {
  margin: 0;
  max-width: 480px;
  font-size: 14px;
  line-height: 1.8;
  color: #c9d1e8;
}
.portal__hero-search-label {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 35px;
  padding-left: 4px;
  box-sizing: border-box;
  color: var(--sw-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.portal__hero-search {
  display: flex;
  width: 1033px;
  max-width: 100%;
  height: 32px;
  margin-top: 2px;
}
.portal__hero-search :deep(.el-input) {
  flex: 1;
}
.portal__hero-search :deep(.el-input__wrapper) {
  height: 32px;
  box-sizing: border-box;
  padding-left: 9px;
  border-radius: 6px 0 0 6px;
  background: #ffffff;
  box-shadow: 0 0 0 1px var(--sw-border-light) inset;
}
.portal__hero-search :deep(.el-button) {
  width: 88px;
  height: 32px;
  min-width: 88px;
  margin-left: 12px;
  padding: 0;
  border-radius: 0 6px 6px 0;
}
.portal__hero-stats {
  position: static;
  display: flex;
  gap: 24px;
  align-items: center;
  align-self: center;
  margin-right: 0;
  padding-right: 0;
}
.portal__hero-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  min-height: 70px;
  box-sizing: border-box;
  padding: 0;
  background: transparent;
  height: auto;
  margin-top: 0;
  align-items: flex-start;
}
.portal__hero-stat--primary {
  background: transparent;
  min-width: 160px;
  margin-top: 0;
  height: auto;
  margin-right: 0;
  padding: 0;
}
.portal__hero-stat--primary strong {
  position: static;
}
.portal__hero-stat--accent {
  background: transparent;
  min-width: 160px;
  padding: 0;
  height: auto;
  margin-top: 0;
}
.portal__hero-stat--accent strong {
  position: static;
  font-size: 26px;
}
.portal__hero-stat strong {
  width: 100%;
  text-align: left;
  font-size: 26px;
  line-height: 34px;
  font-weight: 700;
}
.portal__hero-stat span {
  font-size: 12px;
  text-align: left;
  color: var(--sw-text-secondary);
}
.portal > .portal__section {
  margin: 0;
  padding: 20px 21px 22px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: none;
}
.portal__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.portal__services {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}
.portal-service {
  position: relative;
  display: block;
  min-height: 80px;
  height: 80px;
  padding: 14px 17px;
  text-align: left;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: none;
  cursor: pointer;
}
.portal-service:hover {
  border-color: var(--sw-color-primary);
}
.portal-service__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.portal-service__body strong {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--sw-text-primary);
}
.portal-service__body span {
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.portal__focus {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  margin-top: 0;
}
.portal__focus-section .portal__section-title {
  margin-bottom: 2px;
  line-height: 22px;
}
.portal__lower {
  display: grid;
  grid-template-columns: minmax(0, 3.227fr) minmax(300px, 1fr);
  gap: 20px;
  margin: 0;
}
.portal__analytics,
.portal__focus-section {
  position: relative;
  min-width: 0;
  box-sizing: border-box;
  height: 439.5px;
  min-height: 439.5px;
  padding: 20px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: none;
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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 19px;
  margin: 4px 0 0;
}
.portal__analytics-summary div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.portal__analytics-summary strong {
  color: var(--sw-text-primary);
  font-size: 26px;
  line-height: 32px;
  font-weight: 600;
}
.portal__analytics-summary em {
  color: var(--sw-success);
  font-size: 11px;
  font-style: normal;
  margin-top: 2px;
}
.portal__analytics-summary div:nth-child(3) em {
  color: var(--sw-danger);
}
.portal__analytics-summary span {
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 20px;
}
.portal__analytics-chart-label {
  position: absolute;
  top: 164px;
  left: 21px;
  /* 参考 7:2：图表标题为 14px 深色正文（非 12px 浅灰副注） */
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}
.portal__analytics-bars {
  position: absolute;
  top: 203px;
  right: 19px;
  left: 21px;
  display: flex;
  align-items: flex-end;
  gap: 16px;
  height: 170px;
  border-bottom: 1px solid var(--sw-border-light);
}
.portal__analytics-bar {
  display: flex;
  flex: 1;
  align-items: flex-end;
  height: 100%;
}
.portal__analytics-bar span {
  display: block;
  width: 100%;
  min-height: 18px;
  border-radius: 5px 5px 0 0;
  background: #eff6ff;
}
.portal__analytics-bar:last-child span {
  background: var(--el-color-primary);
}
/* 参考 7:2 趋势日期行：首末标签，12px，与图表同宽 */
.portal__analytics-dates {
  position: absolute;
  top: 389px;
  right: 19px;
  left: 21px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 20px;
}
.portal__analytics-dates small {
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.portal-focus {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 126.5px;
  height: 126.5px;
  padding: 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--sw-border-light);
  border-radius: 0;
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
  min-width: 32px;
  height: auto;
  border-radius: 0;
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 26px;
  line-height: 32px;
  font-weight: 600;
}
.portal-focus__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  width: auto;
  min-width: 0;
  text-align: left;
}
.portal-focus__body strong {
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
}
.portal-focus__body small {
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.portal-focus__view {
  /* 参考 7:2：「查看」是 64×32 幽灵按钮（文字居中，右缘 x≈1824），不是贴右缘的裸文本 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
  margin-right: 55px;
  color: var(--sw-color-primary);
  font-size: 14px;
  white-space: nowrap;
}
/* BF20261013-046：移除 .el-button > span 的 left:18px 位移 hack（曾把「查看」推离按钮中心） */
@media (max-width: 767px) {
  .portal {
    gap: 16px;
    padding: 12px;
  }
  .portal__hero {
    flex-direction: column;
    align-items: stretch;
    height: auto;
    min-height: 0;
    padding: 18px 16px;
  }
  .portal__hero-copy {
    flex: 1 1 auto;
    width: 100%;
  }
  .portal__hero-search {
    flex-wrap: wrap;
    height: auto;
  }
  .portal__hero-search-label {
    width: 100%;
    padding: 0;
  }
  .portal__hero-stats {
    width: 100%;
    flex-wrap: wrap;
    gap: 20px;
    padding: 0;
  }
  .portal__hero-stat {
    flex: 1 1 40%;
    width: auto;
  }
  .portal__services {
    grid-template-columns: 1fr;
  }
  .portal__section {
    padding: 16px !important;
  }
  .portal__lower {
    grid-template-columns: 1fr;
  }
  .portal__analytics,
  .portal__focus-section {
    height: auto;
    min-height: 0;
  }
  .portal__analytics-summary {
    gap: 20px;
    flex-wrap: wrap;
  }
  .portal__analytics-chart-label {
    position: static;
    margin-top: 24px;
  }
  .portal__analytics-bars {
    position: static;
    height: 180px;
    margin-top: 12px;
  }
  .portal__focus {
    margin-top: 12px;
  }
}
</style>
