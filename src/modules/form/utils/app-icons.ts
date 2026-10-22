import type { Component } from 'vue'
export { ICON_ASSETS, iconMask } from '@/components/appearance/icons'
import {
  Folder,
  Grid,
  Files,
  Document,
  Tickets,
  Goods,
  TrendCharts,
  User,
  Bell,
  ChatLineSquare,
  Monitor,
  SetUp,
  List,
  DataLine,
  Promotion,
  Finished,
  Setting,
  Clock,
  Calendar,
  Upload,
  View,
  Connection,
  Search,
  Edit,
  Check,
  Plus,
  VideoPlay,
  VideoPause,
  UserFilled,
} from '@element-plus/icons-vue'

/**
 * 应用图标白名单（字符串名 → Element Plus 图标组件）。
 * 与菜单图标（layouts/menu-icons）同思路：后端只存图标名，前端白名单解析，
 * 不按字符串拼路径、不动态 import。
 */
export const APP_ICON_MAP: Record<string, Component> = {
  Folder,
  Grid,
  Files,
  Document,
  Tickets,
  Goods,
  TrendCharts,
  User,
  Bell,
  ChatLineSquare,
  Monitor,
  SetUp,
  List,
  DataLine,
  Promotion,
  Finished,
  Setting,
  Clock,
  Calendar,
  Upload,
  View,
  Connection,
  Search,
  Edit,
  Check,
  Plus,
  Start: VideoPlay,
  End: VideoPause,
  Countersign: UserFilled,
}

/** 选择器数据源（稳定键名集合）。 */
export const APP_ICON_KEYS: string[] = Object.keys(APP_ICON_MAP)

/** 解析应用图标；未配置或未知名称回退 Folder（不抛错、不空白）。 */
export function resolveAppIcon(name?: string | null): Component {
  return (name && APP_ICON_MAP[name]) || Folder
}

/** 应用颜色预设；历史有效 HEX 仍保持原值。 */
export const APP_COLOR_PRESETS: string[] = [
  '#6f2dff',
  '#2563eb',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#64748b',
]

/** 解析应用主题色；未配置或非法回退品牌主色。 */
export function resolveAppColor(color?: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6f2dff'
}
