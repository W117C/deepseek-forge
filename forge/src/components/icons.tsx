import { Bot, Layers, Puzzle, Wrench, LineChart, Code2, BookOpen, GraduationCap, Briefcase, Database, Globe, Zap, Settings, ShoppingCart } from "lucide-react";
import type { PackageType } from "../types";

export function TypeIcon({ type, size = 17, className = "" }: { type: PackageType; size?: number; className?: string }) {
  switch (type) {
    case "agent": return <Bot size={size} className={className} aria-hidden="true" />;
    case "bundle": return <Layers size={size} className={className} aria-hidden="true" />;
    case "plugin": return <Puzzle size={size} className={className} aria-hidden="true" />;
    case "skill": return <Wrench size={size} className={className} aria-hidden="true" />;
  }
}

const catIcons: Record<string, typeof LineChart> = {
  chart: LineChart, code: Code2, book: BookOpen, grad: GraduationCap,
  briefcase: Briefcase, database: Database, globe: Globe, zap: Zap,
  cog: Settings, cart: ShoppingCart,
};

export function CategoryIcon({ icon, size = 15, className = "" }: { icon: string; size?: number; className?: string }) {
  const C = catIcons[icon] ?? Globe;
  return <C size={size} className={className} aria-hidden="true" />;
}
