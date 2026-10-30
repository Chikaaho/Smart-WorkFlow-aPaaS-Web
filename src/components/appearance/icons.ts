import Grid from '@/assets/icons/020/Grid.svg'
import Document from '@/assets/icons/020/Document.svg'
import Folder from '@/assets/icons/020/Folder.svg'
import User from '@/assets/icons/020/User.svg'
import Setting from '@/assets/icons/020/Setting.svg'
import Clock from '@/assets/icons/020/Clock.svg'
import Calendar from '@/assets/icons/020/Calendar.svg'
import Upload from '@/assets/icons/020/Upload.svg'
import View from '@/assets/icons/020/View.svg'
import Connection from '@/assets/icons/020/Connection.svg'
import Bell from '@/assets/icons/020/Bell.svg'
import Search from '@/assets/icons/020/Search.svg'
import Edit from '@/assets/icons/020/Edit.svg'
import Check from '@/assets/icons/020/Check.svg'
import Plus from '@/assets/icons/020/Plus.svg'
import Start from '@/assets/icons/020/Start.svg'
import End from '@/assets/icons/020/End.svg'
import Countersign from '@/assets/icons/020/Countersign.svg'

export const ICON_ASSETS: Record<string, string> = {
  Grid,
  Document,
  Folder,
  User,
  Setting,
  Clock,
  Calendar,
  Upload,
  View,
  Connection,
  Bell,
  Search,
  Edit,
  Check,
  Plus,
  Start,
  End,
  Countersign,
}

/** Vite 内联 SVG 含引号；CSS url 必须引用整个资源值。 */
export function iconMask(name?: string | null): string {
  const asset = name ? ICON_ASSETS[name] : null
  return asset ? `url(${JSON.stringify(asset)})` : 'none'
}
