<!-- P53 DESIGN_FIDELITY 专用：设计节点01工作台 fixture 视觉副本（几何对齐锁定设计包）。
     仅 design-fixture 会话渲染；内容为设计演示数据，不承载真实业务语义。 -->
<template>
  <div class="wsd">
    <header class="wsd-hero">
      <h2 class="wsd-hero__greeting">下午好，陈曦</h2>
      <p class="wsd-hero__sub">今天有 6 项待办，其中 2 项即将超时</p>
      <button class="wsd-hero__config" type="button">
        <span class="wsd-hero__gear">⚙</span>配置工作台
      </button>
    </header>

    <div class="wsd-stats">
      <div v-for="s in stats" :key="s.label" class="wsd-stat">
        <span class="wsd-stat__label">{{ s.label }}</span>
        <span class="wsd-stat__value">{{ s.value }}</span>
        <span class="wsd-stat__badge" :style="{ color: s.badgeColor }">{{ s.badge }}</span>
        <span class="wsd-stat__iconbg" :style="{ background: s.iconBg, color: s.iconColor }"
          ><el-icon :size="24"><component :is="s.icon" /></el-icon
        ></span>
      </div>
    </div>

    <div class="wsd-mid">
      <section class="wsd-panel wsd-panel--todo">
        <div class="wsd-panel__head">
          <h3 class="wsd-panel__title">我的待办</h3>
          <button class="wsd-btn" type="button">全部待办 →</button>
        </div>
        <div class="wsd-chiprow">
          <span
            v-for="t in todoTabs"
            :key="t.label"
            class="wsd-chip"
            :class="{ 'is-active': t.active }"
            >{{ t.label }} {{ t.count }}</span
          >
        </div>
        <ul class="wsd-taskrows">
          <li v-for="row in todoRows" :key="row.title" class="wsd-task">
            <span class="wsd-task__prio" :style="{ background: row.prioColor }" />
            <span class="wsd-task__title">{{ row.title }}</span>
            <span class="wsd-task__dept">{{ row.dept }}</span>
            <span class="wsd-task__due">{{ row.due }}</span>
            <span class="wsd-task__status" :class="row.urgent ? 'is-urgent' : ''">{{
              row.status
            }}</span>
          </li>
        </ul>
      </section>
      <section class="wsd-panel wsd-panel--quick">
        <div class="wsd-panel__head">
          <h3 class="wsd-panel__title">快捷发起</h3>
          <button class="wsd-pill" type="button">管理常用事项</button>
        </div>
        <div class="wsd-quickgrid">
          <button v-for="q in quickActions" :key="q.label" class="wsd-quick" type="button">
            <span class="wsd-quick__icon" :style="{ color: q.color }"
              ><el-icon :size="22"><component :is="q.icon" /></el-icon
            ></span>
            <span class="wsd-quick__label">{{ q.label }}</span>
          </button>
        </div>
      </section>
    </div>

    <div class="wsd-bottom">
      <section class="wsd-panel wsd-panel--activity">
        <div class="wsd-panel__head">
          <h3 class="wsd-panel__title">业务动态</h3>
          <span class="wsd-panel__hint">最近 7 天</span>
        </div>
        <div class="wsd-chiprow">
          <span
            v-for="c in activityTabs"
            :key="c"
            class="wsd-chip"
            :class="{ 'is-active': c === '全部' }"
            >{{ c }}</span
          >
        </div>
        <ul class="wsd-actrows">
          <li v-for="row in activityRows" :key="row.title" class="wsd-act">
            <div class="wsd-act__main">
              <span class="wsd-act__title">{{ row.title }}</span>
              <span class="wsd-act__meta">{{ row.meta }}</span>
            </div>
            <span class="wsd-act__time">{{ row.time }}</span>
          </li>
        </ul>
      </section>
      <section class="wsd-panel wsd-panel--eff">
        <div class="wsd-panel__head">
          <h3 class="wsd-panel__title">流程效能</h3>
          <span class="wsd-panel__hint">近 7 天</span>
        </div>
        <div class="wsd-eff-hero">
          <div class="wsd-eff-hero__main">
            <span class="wsd-eff-hero__label">平均处理时长</span>
            <span class="wsd-eff-hero__value">6.4 小时</span>
          </div>
          <span class="wsd-eff-hero__pill">↓ 18%</span>
        </div>
        <div class="wsd-eff-rate">
          <div class="wsd-eff-rate__head">
            <span>按时完成率</span><span class="wsd-eff-rate__num">92%</span>
          </div>
          <div class="wsd-eff-rate__bar"><span class="wsd-eff-rate__fill" /></div>
        </div>
        <div class="wsd-eff-grid">
          <div v-for="b in effStats" :key="b.label" class="wsd-eff-box">
            <span class="wsd-eff-box__label">{{ b.label }}</span>
            <span class="wsd-eff-box__value" :style="{ color: b.color }">{{ b.value }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// 演示内容与几何均取自锁定设计节点01（figma 21:2 子树）。
import {
  Clock,
  Promotion,
  CircleCheck,
  EditPen,
  ShoppingCart,
  Key,
  MoreFilled,
  Setting,
  Aim,
} from '@element-plus/icons-vue'
const stats = [
  {
    label: '待我处理',
    value: '6',
    badge: '2 项临期',
    badgeColor: '#E04B55',
    icon: Clock,
    iconBg: '#EEEBFF',
    iconColor: '#6F2DFF',
  },
  {
    label: '我发起的',
    value: '18',
    badge: '3 项进行中',
    badgeColor: '#12805C',
    icon: Promotion,
    iconBg: '#E6F7F1',
    iconColor: '#18A67A',
  },
  {
    label: '本周已办',
    value: '27',
    badge: '较上周 +12%',
    badgeColor: '#0E7A8A',
    icon: CircleCheck,
    iconBg: '#E0F5F8',
    iconColor: '#12A5B8',
  },
  {
    label: '草稿',
    value: '3',
    badge: '继续编辑',
    badgeColor: '#945F00',
    icon: EditPen,
    iconBg: '#FFF4E0',
    iconColor: '#B8860B',
  },
]
const todoTabs = [
  { label: '全部', count: 6, active: true },
  { label: '临期', count: 2, active: false },
]
const todoRows = [
  {
    title: '灾备演练申请',
    dept: '科技运营部 · 会签',
    due: '还剩 2 小时',
    status: '紧急',
    urgent: true,
    prioColor: '#E04B55',
  },
  {
    title: '采购付款申请',
    dept: '财务共享中心 · 审批',
    due: '今天 17:30',
    status: '待处理',
    urgent: false,
    prioColor: '#B8860B',
  },
  {
    title: 'IoT 设备接入',
    dept: '智慧校园项目 · 会签',
    due: '明天 10:00',
    status: '待处理',
    urgent: false,
    prioColor: '#12A5B8',
  },
  {
    title: '知识库权限申请',
    dept: '平台研发部 · 审批',
    due: '09-18',
    status: '普通',
    urgent: false,
    prioColor: '#697386',
  },
]
const quickActions = [
  { label: '出差申请', icon: Promotion, color: '#6F2DFF' },
  { label: '采购申请', icon: ShoppingCart, color: '#18A67A' },
  { label: '灾备演练', icon: Aim, color: '#12A5B8' },
  { label: '设备接入', icon: Setting, color: '#B8860B' },
  { label: '权限申请', icon: Key, color: '#E04B55' },
  { label: '更多事项', icon: MoreFilled, color: '#697386' },
]
const activityTabs = ['全部', '审批', '抄送', '消息']
const activityRows = [
  { title: '灾备演练申请进入「科技负责人会签」', meta: '流程审批 · 林悦', time: '09:32' },
  { title: '采购付款申请已通过财务复核', meta: '审批完成 · 周明', time: '昨天 18:20' },
  { title: '校园北门异常流量工单抄送给你', meta: '抄送消息 · P1 工单', time: '昨天 16:05' },
  { title: 'IoT 设备接入申请已完成会签', meta: '设备管理 · 智慧校园', time: '09-14 11:06' },
]
const effStats = [
  { label: '本周已办', value: '27', color: '#6F2DFF' },
  { label: '即将超时', value: '2', color: '#E04B55' },
  { label: '平均等待', value: '1.8h', color: '#18A67A' },
]
</script>

<style scoped>
/* 几何对齐 figma 21:2：内容宽 1152，左右面板 740/388，垂直 0/80/208/562 */
.wsd {
  display: flex;
  flex-direction: column;
}
.wsd-hero {
  position: relative;
  height: 64px;
}
.wsd-hero__greeting {
  margin: 0;
  font-size: 24px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-hero__sub {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 28px;
  color: var(--sw-text-secondary);
}
.wsd-hero__config {
  position: absolute;
  right: 0;
  top: 10px;
  height: 42px;
  padding: 0 18px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  color: var(--sw-text-primary);
  font-size: 14px;
  cursor: pointer;
}
.wsd-hero__gear {
  color: var(--sw-color-primary);
  margin-right: 6px;
}
.wsd-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  margin-top: 16px;
}
.wsd-stat {
  position: relative;
  height: 108px;
  padding: 18px 20px;
  background: #ffffff;
  border-radius: 10px;
}
.wsd-stat__label {
  display: block;
  font-size: 13px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.wsd-stat__value {
  display: block;
  margin-top: 6px;
  font-size: 36px;
  line-height: 36px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-stat__badge {
  position: absolute;
  left: 20px;
  bottom: 12px;
  font-size: 12px;
  line-height: 16px;
}
.wsd-stat__iconbg {
  position: absolute;
  right: 20px;
  top: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
}
.wsd-mid,
.wsd-bottom {
  display: grid;
  grid-template-columns: 740px 1fr;
  gap: 24px;
  margin-top: 20px;
}
.wsd-panel {
  padding: 20px 24px;
  background: #ffffff;
  border-radius: 10px;
}
.wsd-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wsd-panel__title {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-panel__hint {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-pill {
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--sw-border);
  border-radius: 999px;
  background: #ffffff;
  font-size: 12px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-chiprow {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.wsd-chip {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 22px;
  border: 1px solid var(--sw-border-light);
  border-radius: 6px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-chip.is-active {
  border-color: var(--sw-color-primary);
  color: var(--sw-color-primary);
  font-weight: 600;
}
.wsd-taskrows {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
}
.wsd-task {
  position: relative;
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 12px 0 12px;
  border-radius: 6px;
}
.wsd-task:nth-child(odd) {
  background: #f7f8fc;
}
.wsd-task__prio {
  width: 6px;
  height: 14px;
  border-radius: 3px;
  margin-right: 8px;
}
.wsd-task__title {
  width: 170px;
  font-size: 14px;
  font-weight: 500;
  color: var(--sw-text-primary);
}
.wsd-task__dept {
  width: 190px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-task__due {
  flex: 1;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-task__status {
  width: 104px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #f0fdf4;
  color: #12805c;
  font-size: 13px;
}
.wsd-task__status.is-urgent {
  background: #fdebec;
  color: #e04b55;
}
.wsd-quickgrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 12px;
  margin-top: 18px;
}
.wsd-quick {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 62px;
  padding: 0 17px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  background: #ffffff;
  font-size: 14px;
  color: var(--sw-text-primary);
  cursor: pointer;
}
.wsd-actrows {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
}
.wsd-act {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 51px;
  padding: 0 16px 0 16px;
  border-radius: 6px;
}
.wsd-act:nth-child(odd) {
  background: #f7f8fc;
}
.wsd-act__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wsd-act__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--sw-text-primary);
}
.wsd-act__meta {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-act__time {
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-eff-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding: 16px 18px;
  background: var(--sw-surface-page);
  border-radius: 8px;
}
.wsd-eff-hero__label {
  display: block;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-hero__value {
  font-size: 24px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.wsd-eff-hero__pill {
  padding: 5px 12px;
  border-radius: 999px;
  background: #e6f7f1;
  color: #12805c;
  font-size: 13px;
}
.wsd-eff-rate {
  margin-top: 16px;
}
.wsd-eff-rate__head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.wsd-eff-rate__num {
  color: #12805c;
  font-weight: 600;
}
.wsd-eff-rate__bar {
  height: 8px;
  margin-top: 8px;
  border-radius: 999px;
  background: var(--sw-surface-page);
  overflow: hidden;
}
.wsd-eff-rate__fill {
  display: block;
  width: 92%;
  height: 100%;
  border-radius: 999px;
  background: #18a67a;
}
.wsd-eff-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 16px;
}
.wsd-eff-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
}
.wsd-eff-box__label {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.wsd-eff-box__value {
  font-size: 20px;
  font-weight: 600;
}
</style>
