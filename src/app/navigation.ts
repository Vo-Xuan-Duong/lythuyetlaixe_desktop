export type AppSection =
  | "dashboard"
  | "learning"
  | "critical"
  | "exam"
  | "mistakes"
  | "bookmarks"
  | "statistics"
  | "settings";

export interface NavigationItem {
  id: AppSection;
  label: string;
  shortLabel: string;
  icon: string;
}

export const navigationItems: NavigationItem[] = [
  { id: "dashboard", label: "Trang chủ", shortLabel: "Home", icon: "⌂" },
  { id: "learning", label: "Học 600 câu", shortLabel: "Học", icon: "▤" },
  { id: "critical", label: "60 câu điểm liệt", shortLabel: "Điểm liệt", icon: "!" },
  { id: "exam", label: "Thi thử", shortLabel: "Thi", icon: "✓" },
  { id: "mistakes", label: "Câu làm sai", shortLabel: "Câu sai", icon: "×" },
  { id: "bookmarks", label: "Đã đánh dấu", shortLabel: "Đánh dấu", icon: "★" },
  { id: "statistics", label: "Thống kê", shortLabel: "Thống kê", icon: "◫" },
  { id: "settings", label: "Cài đặt", shortLabel: "Cài đặt", icon: "⚙" },
];
