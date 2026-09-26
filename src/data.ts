import type { LayoutSpec, ReviewStatus, SignItem, SignProject, TermBinding } from "./types";
import { uid } from "./uid";

export { uid };
export const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  changes: "需修改",
};

const term = (source: string, target: string, confirmed = false, required = true): TermBinding => ({
  id: uid("term"),
  source,
  target,
  required,
  confirmed,
});

const scenario = (
  id: string,
  name: string,
  widths: number[],
  minFont: number,
  maxFont: number,
  maxLines: number,
): LayoutSpec => ({
  id,
  name,
  widths,
  minFont,
  maxFont,
  maxLines,
  updatedAt: "2026-09-20T00:00:00.000Z",
});

/** 内置场景规格：站台牌面大、疏散通道紧凑、公园标识偏小。 */
export const createSeedScenarios = (): LayoutSpec[] => [
  scenario("scn-platform", "轨道交通站台", [720, 960, 1200], 48, 96, 3),
  scenario("scn-exit", "商场疏散通道", [320, 480, 640], 28, 64, 2),
  scenario("scn-park", "公园服务亭", [240, 360, 480], 22, 48, 4),
  scenario("scn-hospital", "医院入口", [480, 640, 800], 32, 72, 3),
];

export const createSeedProject = (): SignProject => {
  const scenarios = createSeedScenarios();
  const signs: SignItem[] = [
    {
      id: "sign-platform",
      code: "TR-01",
      sourceText: "候车区。请在黄线内排队，照看好随身物品。",
      targetLanguage: "English",
      targetText: "Waiting Area\nPlease queue behind the yellow line and keep your belongings with you.",
      scenarioId: "scn-platform",
      regulation: "GB/T 10001.1-2023 公共信息图形符号",
      status: "pending",
      terms: [term("候车区", "Waiting Area"), term("黄线", "yellow line")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      layoutWidth: 1200,
      layoutFont: 56,
      updatedAt: "2026-09-21T09:20:00.000Z",
    },
    {
      id: "sign-exit",
      code: "EM-02",
      sourceText: "紧急出口。发生紧急情况时，请按指示方向迅速撤离，不要乘坐电梯。",
      targetLanguage: "English",
      targetText: "EMERGENCY EXIT\nExit quickly. No elevator.",
      scenarioId: "scn-exit",
      regulation: "GB 13495.1-2015 消防安全标志",
      status: "confirmed",
      terms: [term("紧急出口", "EMERGENCY EXIT", true), term("电梯", "elevator", true)],
      comments: [],
      versions: [],
      emergencyRevision: false,
      layoutWidth: 480,
      layoutFont: 28,
      updatedAt: "2026-09-18T06:10:00.000Z",
    },
    {
      id: "sign-water",
      code: "SV-03",
      sourceText: "直饮水。请勿将茶叶、果皮等杂物丢入水槽。",
      targetLanguage: "日本語",
      targetText: "飲料水\n茶殻や果物の皮などを流さないでください。",
      scenarioId: "scn-park",
      regulation: "城市公共设施双语标识译写规范",
      status: "changes",
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      layoutWidth: 360,
      layoutFont: 30,
      updatedAt: "2026-09-23T02:40:00.000Z",
    },
    {
      id: "sign-smoking",
      code: "PR-07",
      sourceText: "禁止吸烟。包括电子烟。",
      targetLanguage: "Français",
      targetText: "INTERDICTION DE FUMER\nCigarettes électroniques incluses.",
      scenarioId: "scn-hospital",
      regulation: "公共场所卫生管理条例实施细则",
      status: "draft",
      terms: [term("禁止吸烟", "INTERDICTION DE FUMER"), term("电子烟", "Cigarettes électroniques")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      layoutWidth: 640,
      layoutFont: 44,
      updatedAt: "2026-09-24T04:15:00.000Z",
    },
  ];

  return {
    id: "public-sign-review-1008",
    title: "城市公共标识多语言校对",
    location: "滨海交通枢纽一期",
    activeSignId: signs[0].id,
    scenarios,
    signs,
    updatedAt: new Date().toISOString(),
  };
};

interface V1SignItem extends Omit<SignItem, "scenarioId" | "layoutWidth" | "layoutFont"> {
  scenario: string;
}

interface V1Project extends Omit<SignProject, "scenarios" | "signs"> {
  signs: V1SignItem[];
}

/** 旧版（schema 1）数据迁移：按场景名归并到场景规格，并套用规格内的宽度/字号。 */
export function migrateProject(stored: unknown): SignProject | null {
  if (!stored || typeof stored !== "object") return null;
  const record = stored as { schema?: number; project?: unknown };
  if (record.schema !== 1 || !record.project || typeof record.project !== "object") return null;
  const legacy = record.project as V1Project;
  if (!Array.isArray(legacy.signs) || !legacy.signs.length) return null;

  const scenarios = createSeedScenarios();
  const findScenario = (name: string): LayoutSpec => {
    const found = scenarios.find((item) => item.name === name || name.includes(item.name) || item.name.includes(name));
    if (found) return found;
    const created: LayoutSpec = {
      id: uid("scn"),
      name,
      widths: [320, 480, 720, 960],
      minFont: 28,
      maxFont: 88,
      maxLines: 3,
      updatedAt: new Date().toISOString(),
    };
    scenarios.push(created);
    return created;
  };

  const signs: SignItem[] = legacy.signs.map((sign) => {
    const spec = findScenario(sign.scenario);
    const width = spec.widths.includes(480) ? 480 : spec.widths[Math.floor(spec.widths.length / 2)];
    const font = Math.min(spec.maxFont, Math.max(spec.minFont, 42));
    return {
      ...sign,
      scenarioId: spec.id,
      layoutWidth: width,
      layoutFont: font,
    };
  });

  return {
    id: legacy.id ?? "public-sign-review-1008",
    title: legacy.title ?? "城市公共标识多语言校对",
    location: legacy.location ?? "",
    activeSignId: signs.some((sign) => sign.id === legacy.activeSignId) ? legacy.activeSignId : signs[0].id,
    scenarios,
    signs,
    updatedAt: new Date().toISOString(),
  };
}
