import {
  BarChart3,
  Binary,
  BookOpen,
  Brain,
  Briefcase,
  Bug,
  Code2,
  Coffee,
  Cpu,
  Database,
  FunctionSquare,
  Gamepad2,
  Layers,
  LineChart,
  MessagesSquare,
  MicroscopeIcon,
  Network,
  Server,
  Sigma,
  Sparkles,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";

/**
 * Course slug to icon.
 *
 * The catalog lives in the database now, but an icon is a React component and
 * cannot, so the two are joined here by slug. A course with no entry — anything
 * created during an import, for instance — falls back rather than breaking the
 * card.
 */
const ICONS: Record<string, LucideIcon> = {
  "english-i": BookOpen,
  "english-ii": BookOpen,
  "mathematics-i": Sigma,
  "mathematics-ii": Sigma,
  "statistics-i": BarChart3,
  "statistics-ii": BarChart3,
  "computational-thinking": Binary,
  "programming-in-python": Code2,
  "database-management-systems": Database,
  "programming-in-java": Coffee,
  "data-structures-and-algorithms": Layers,
  "modern-application-development-i": TerminalSquare,
  "modern-application-development-ii": TerminalSquare,
  "mathematical-methods-for-data-science": FunctionSquare,
  "machine-learning-foundations": Brain,
  "machine-learning-techniques": Brain,
  "machine-learning-practice": Brain,
  "business-data-management": Briefcase,
  "business-analytics": LineChart,
  "tools-in-data-science": TerminalSquare,
  "system-commands": Server,
  "software-engineering": Cpu,
  "software-testing": Bug,
  "operating-systems": Server,
  "computer-systems-architecture": MicroscopeIcon,
  "computer-system-design": MicroscopeIcon,
  "artificial-intelligence": Sparkles,
  "deep-learning": Network,
  "deep-learning-practice": Network,
  "deep-learning-for-computer-vision": Network,
  "large-language-models": MessagesSquare,
  "big-data-analytics": Database,
  "natural-language-processing": MessagesSquare,
  "reinforcement-learning": Gamepad2,
  "programming-in-c": Code2,
  "statistical-computing": BarChart3,
  "advanced-algorithms": Layers,
  "game-theory-and-strategy": Gamepad2,
  "managerial-economics": Briefcase,
  "market-research": LineChart,
  "mathematical-foundations-of-generative-ai": FunctionSquare,
  "algorithmic-thinking-in-bioinformatics": Binary,
};

export const iconForCourse = (slug: string): LucideIcon => ICONS[slug] ?? BookOpen;
