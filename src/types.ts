export type ReviewStatus = "draft" | "pending" | "confirmed" | "changes";

export interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: Reply[];
}

export interface TermBinding {
  id: string;
  source: string;
  target: string;
  required: boolean;
  confirmed: boolean;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  sourceText: string;
  targetText: string;
  status: ReviewStatus;
  terms: TermBinding[];
}

/** 按场景管理的版面规格：可用宽度档、字号上下限、最多行数。 */
export interface LayoutSpec {
  id: string;
  name: string;
  /** 标识牌可用的版面宽度（像素），校对时在这些档位间切换。 */
  widths: number[];
  minFont: number;
  maxFont: number;
  /** 该场景标识允许的最多行数，超出即按规格判溢出。 */
  maxLines: number;
  updatedAt: string;
}

export interface SignItem {
  id: string;
  code: string;
  sourceText: string;
  targetLanguage: string;
  targetText: string;
  scenarioId: string;
  regulation: string;
  status: ReviewStatus;
  terms: TermBinding[];
  comments: ReviewComment[];
  versions: VersionSnapshot[];
  emergencyRevision: boolean;
  /** 当前校对选用的宽度档与字号（须落在所属场景规格范围内）。 */
  layoutWidth: number;
  layoutFont: number;
  updatedAt: string;
}

export interface SignProject {
  id: string;
  title: string;
  location: string;
  activeSignId: string;
  scenarios: LayoutSpec[];
  signs: SignItem[];
  updatedAt: string;
}

export interface PersistedProject {
  schema: 2;
  project: SignProject;
}

export interface DiffToken {
  type: "same" | "add" | "remove";
  value: string;
}
