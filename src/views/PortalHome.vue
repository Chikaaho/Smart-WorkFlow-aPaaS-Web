<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'
import { useMenuStore } from '@/stores/menu'
import { Share, Document, MagicStick, Cpu, Bell, Star } from '@element-plus/icons-vue'
import { queryCatalogItems } from '@/modules/workflow/api/oa'
import { myInstances, queryTodoTasks } from '@/modules/workflow/api'
import { unreadNotifyCount } from '@/modules/notify/api'
import { visibleMenu, toFullPath } from '@/layouts/menu-utils'
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

const localizedMenu = useLocalizedMenuTree(computed(() => menuStore.menu))

function collectPaths(nodes: MenuNode[], into: Set<string>): void {
  for (const node of nodes) {
    into.add(toFullPath(node))
    if (node.children?.length) collectPaths(node.children, into)
  }
}

const reachable = computed(() => {
  // 可达性=服务端菜单全树（跨区域门户入口按权限显示）；剔除按钮/隐藏行。
  const paths = new Set<string>()
  collectPaths(visibleMenu(localizedMenu.value), paths)
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
  { key: 'todo', icon: Star, label: t('workspace.statMyTodo'), value: todoTotal.value, to: '' },
  {
    key: 'unread',
    icon: Bell,
    label: t('nav.notifications'),
    value: unread.value,
    to: reachable.value.has('/notify/inbox') ? '/notify/inbox' : '',
  },
])

onMounted(async () => {
  try {
    const [catalog, initiated, todo, unreadCount] = await Promise.allSettled([
      queryCatalogItems({ pageNum: 1, pageSize: 1 }),
      myInstances({ pageNum: 1, pageSize: 1 }),
      queryTodoTasks({ pageNum: 1, pageSize: 1 }),
      unreadNotifyCount(),
    ])
    if (catalog.status === 'fulfilled') catalogTotal.value = catalog.value.total
    if (initiated.status === 'fulfilled') initiatedTotal.value = initiated.value.total
    if (todo.status === 'fulfilled') todoTotal.value = todo.value.total
    if (unreadCount.status === 'fulfilled') unread.value = unreadCount.value
  } finally {
    loading.value = false
  }
})

function open(to: string): void {
  if (to) void router.push(to)
}
</script>

<template>
  <div v-loading="loading" class="portal">
    <section class="portal__hero">
      <div class="portal__hero-text">
        <h2>{{ t('portal.heroTitle') }}</h2>
        <p>{{ t('portal.heroSub') }}</p>
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

    <section class="portal__section">
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
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.portal {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1408px;
  padding: 24px 32px 32px;
  margin: 0 auto;
}
.portal__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 36px 40px;
  border-radius: var(--sw-radius-lg);
  background:
    radial-gradient(700px 340px at 88% -30%, rgba(111, 45, 255, 0.45), transparent 62%),
    linear-gradient(150deg, #111b3b 0%, #172033 100%);
  color: #ffffff;
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
  color: rgba(255, 255, 255, 0.78);
}
.portal__hero-stats {
  display: flex;
  gap: 16px;
}
.portal__hero-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
  padding: 18px 22px;
  border-radius: var(--sw-radius-base);
  background: #202f63;
}
.portal__hero-stat--primary {
  background: var(--sw-color-primary);
}
.portal__hero-stat strong {
  font-size: 28px;
  font-weight: 700;
}
.portal__hero-stat span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}
.portal__section-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.portal__services {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.portal-service {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px;
  text-align: left;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  cursor: pointer;
}
.portal-service:hover {
  border-color: var(--sw-color-primary);
}
.portal-service__icon {
  flex: 0 0 auto;
  color: var(--sw-color-primary);
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
  gap: 4px;
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
  font-size: 12px;
  color: var(--sw-color-primary);
  white-space: nowrap;
}
.portal__focus {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}
.portal-focus {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-card);
  font-size: 13px;
  color: var(--sw-text-regular);
  cursor: pointer;
}
.portal-focus:disabled {
  cursor: default;
}
.portal-focus strong {
  margin-left: auto;
  font-size: 18px;
  color: var(--sw-color-primary);
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
}
</style>
