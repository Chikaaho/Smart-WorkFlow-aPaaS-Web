import type { Component } from 'vue'
import {
  Setting,
  Grid,
  Share,
  Bell,
  MagicStick,
  Cpu,
  Connection,
  Document,
  EditPen,
  Tickets,
  Files,
  User,
  Avatar,
  Monitor,
  Finished,
  Message,
  TrendCharts,
  Checked,
  Position,
  Clock,
  List,
  Promotion,
  Link,
  Goods,
  ChatLineSquare,
  DataLine,
  SetUp,
  Menu,
  Switch,
} from '@element-plus/icons-vue'

/**
 * 菜单 icon 字段（字符串）→ Element Plus 图标组件的白名单映射。
 * 仅在 layouts 内使用，不触碰 modules 的第三方库直引边界。
 */
const ICON_MAP: Record<string, Component> = {
  Setting,
  Grid,
  Share,
  Bell,
  MagicStick,
  Cpu,
  Connection,
  Document,
  EditPen,
  Tickets,
  Files,
  User,
  Avatar,
  Monitor,
  Finished,
  Message,
  TrendCharts,
  Checked,
  Position,
  Clock,
  ToggleOn: Switch,
  List,
  Promotion,
  Link,
  Goods,
  ChatLineSquare,
  DataLine,
  SetUp,
  Menu,
}

export function menuIcon(name?: string): Component | undefined {
  return name ? ICON_MAP[name] : undefined
}

/** 通用图标库白名单键名（V012-BUG-011 菜单管理图标选择器数据源）。 */
export const MENU_ICON_KEYS: string[] = Object.keys(ICON_MAP)
