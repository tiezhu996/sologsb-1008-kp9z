import type { ReviewStatus, ScenarioSpec, SignItem, SignProject, TermBinding } from "./types";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  changes: "需修改",
};

export const createDefaultScenarios = (): ScenarioSpec[] => [
  { id: "scenario-platform", name: "轨道交通站台", width: 960, minFontSize: 32, maxFontSize: 64, maxLines: 3 },
  { id: "scenario-evacuation", name: "商场疏散通道", width: 720, minFontSize: 36, maxFontSize: 72, maxLines: 2 },
  { id: "scenario-park", name: "公园服务亭", width: 480, minFontSize: 28, maxFontSize: 48, maxLines: 3 },
  { id: "scenario-hospital", name: "医院入口", width: 640, minFontSize: 30, maxFontSize: 56, maxLines: 2 },
];

const FALLBACK_SPEC = { width: 640, minFontSize: 28, maxFontSize: 56, maxLines: 3 };

/** 兼容 v1 本地数据：把标识上的场景名转换为场景规格并建立关联。 */
export function migrateProject(raw: unknown): SignProject | null {
  const project = raw as SignProject & { signs: (SignItem & { scenario?: string })[] };
  if (!project?.signs?.length) return null;
  if (!Array.isArray(project.scenarios) || project.scenarios.length === 0) {
    const scenarios = createDefaultScenarios();
    for (const sign of project.signs) {
      const name = typeof sign.scenario === "string" ? sign.scenario : "";
      let spec = scenarios.find((item) => item.name === name);
      if (!spec) {
        spec = { id: uid("scenario"), name: name || "未命名场景", ...FALLBACK_SPEC };
        scenarios.push(spec);
      }
      sign.scenarioId = spec.id;
      delete sign.scenario;
    }
    project.scenarios = scenarios;
  }
  for (const sign of project.signs) {
    if (!project.scenarios.some((spec) => spec.id === sign.scenarioId)) {
      sign.scenarioId = project.scenarios[0].id;
    }
  }
  return project;
}

const term = (source: string, target: string, confirmed = false, required = true): TermBinding => ({
  id: uid("term"),
  source,
  target,
  required,
  confirmed,
});

export const createSeedProject = (): SignProject => {
  const signs: SignItem[] = [
    {
      id: "sign-platform",
      code: "TR-01",
      sourceText: "候车区。请在黄线内排队，照看好随身物品。",
      targetLanguage: "English",
      targetText: "Waiting Area\nPlease queue behind the yellow line and keep your belongings with you.",
      scenarioId: "scenario-platform",
      regulation: "GB/T 10001.1-2023 公共信息图形符号",
      status: "pending",
      terms: [term("候车区", "Waiting Area"), term("黄线", "yellow line")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-21T09:20:00.000Z",
    },
    {
      id: "sign-exit",
      code: "EM-02",
      sourceText: "紧急出口。发生紧急情况时，请按指示方向迅速撤离，不要乘坐电梯。",
      targetLanguage: "English",
      targetText: "EMERGENCY EXIT\nIn an emergency, leave quickly in the direction shown. Do not use the elevator.",
      scenarioId: "scenario-evacuation",
      regulation: "GB 13495.1-2015 消防安全标志",
      status: "confirmed",
      terms: [term("紧急出口", "EMERGENCY EXIT", true), term("电梯", "elevator", true)],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-18T06:10:00.000Z",
    },
    {
      id: "sign-water",
      code: "SV-03",
      sourceText: "直饮水。请勿将茶叶、果皮等杂物丢入水槽。",
      targetLanguage: "日本語",
      targetText: "飲料水\n茶殻や果物の皮などを流さないでください。",
      scenarioId: "scenario-park",
      regulation: "城市公共设施双语标识译写规范",
      status: "changes",
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-23T02:40:00.000Z",
    },
    {
      id: "sign-smoking",
      code: "PR-07",
      sourceText: "禁止吸烟。包括电子烟。",
      targetLanguage: "Français",
      targetText: "INTERDICTION DE FUMER\nCigarettes électroniques incluses.",
      scenarioId: "scenario-hospital",
      regulation: "公共场所卫生管理条例实施细则",
      status: "draft",
      terms: [term("禁止吸烟", "INTERDICTION DE FUMER"), term("电子烟", "Cigarettes électroniques")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-24T04:15:00.000Z",
    },
  ];

  return {
    id: "public-sign-review-1008",
    title: "城市公共标识多语言校对",
    location: "滨海交通枢纽一期",
    activeSignId: signs[0].id,
    signs,
    scenarios: createDefaultScenarios(),
    updatedAt: new Date().toISOString(),
  };
};
