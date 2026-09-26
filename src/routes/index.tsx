import { $, component$, useSignal, useVisibleTask$, type QRL } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { createSeedProject, migrateProject, STATUS_LABELS, uid } from "../data";
import type { LayoutSpec, ReviewStatus, SignItem, SignProject } from "../types";
import { analyzeSign, clampLayout, cloneTerms, diffText } from "../utils";

const STORAGE_KEY = "sologsb-1008-project-v2";

export const head: DocumentHead = {
  title: "公共标识多语言校对台",
  meta: [
    { name: "description", content: "公共标识译文、术语、版本和版面风险校对工作台" },
  ],
};

function statusClass(status: ReviewStatus) {
  if (status === "confirmed") return "badge-success";
  if (status === "changes") return "badge-error";
  if (status === "pending") return "badge-warning";
  return "badge-neutral";
}

function riskLabel(risk: "high" | "medium" | "low") {
  return risk === "high" ? "高风险" : risk === "medium" ? "需留意" : "版面安全";
}

function riskClass(risk: "high" | "medium" | "low") {
  return risk === "high" ? "font-bold text-error" : risk === "medium" ? "font-bold text-warning" : "text-success";
}

function specSummary(spec: LayoutSpec) {
  return `${spec.widths.join("/")}px · 字号 ${spec.minFont}–${spec.maxFont}px · 最多 ${spec.maxLines} 行`;
}

export default component$(() => {
  const project = useSignal<SignProject>(createSeedProject());
  const past = useSignal<SignProject[]>([]);
  const future = useSignal<SignProject[]>([]);
  const hydrated = useSignal(false);
  const online = useSignal(true);
  const tab = useSignal<"review" | "scenarios">("review");
  const selectedVersionId = useSignal("");
  const termSource = useSignal("");
  const termTarget = useSignal("");
  const commentDraft = useSignal("");
  const replyDraft = useSignal("");
  const replyingTo = useSignal("");
  const toast = useSignal("");
  const previewId = useSignal("");
  const readOnly = useSignal(false);

  // 场景规格编辑草稿
  const editingSpecId = useSignal("");
  const draftName = useSignal("");
  const draftWidths = useSignal("");
  const draftMinFont = useSignal(28);
  const draftMaxFont = useSignal(88);
  const draftMaxLines = useSignal(3);

  const findSpec = (id: string) => project.value.scenarios.find((item) => item.id === id);
  const active = () =>
    project.value.signs.find((sign) => sign.id === (previewId.value || project.value.activeSignId)) ??
    project.value.signs[0];
  const activeSpec = () => findSpec(active().scenarioId);
  /** 标识的风险始终按其所属场景规格和标识自身的宽度档/字号计算。 */
  const signRisk = (sign: SignItem, source: SignProject = project.value) =>
    analyzeSign(sign, source.scenarios.find((item) => item.id === sign.scenarioId), sign.layoutWidth, sign.layoutFont);
  const preview = () => signRisk(active());

  const commit = $((label: string, update: (draft: SignProject) => void) => {
    past.value = [...past.value.slice(-49), structuredClone(project.value)];
    future.value = [];
    const draft = structuredClone(project.value);
    update(draft);
    draft.updatedAt = new Date().toISOString();
    project.value = draft;
  });

  const updateActive = $((label: string, update: (sign: SignItem, draft: SignProject) => void) => {
    commit(label, (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (sign) update(sign, draft);
    });
  });

  const undo = $(() => {
    if (!past.value.length) return;
    const previous = past.value.at(-1)!;
    future.value = [structuredClone(project.value), ...future.value].slice(0, 50);
    past.value = past.value.slice(0, -1);
    project.value = previous;
    toast.value = "已撤销";
  });

  const redo = $(() => {
    if (!future.value.length) return;
    const next = future.value[0];
    past.value = [...past.value.slice(-49), structuredClone(project.value)];
    future.value = future.value.slice(1);
    project.value = next;
    toast.value = "已重做";
  });

  const navigateSign = $((direction: 1 | -1) => {
    if (readOnly.value) return;
    const signs = project.value.signs;
    const index = Math.max(0, signs.findIndex((sign) => sign.id === project.value.activeSignId));
    const next = signs[(index + direction + signs.length) % signs.length];
    commit("切换标识", (draft) => { draft.activeSignId = next.id; });
    selectedVersionId.value = "";
  });

  const setStatus = $((status: ReviewStatus) => {
    commit("更新审校状态", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      if (sign.emergencyRevision && status === "confirmed") {
        sign.status = "pending";
      } else {
        sign.status = status;
      }
    });
  });

  const toggleEmergency = $(() => {
    commit("切换紧急修订", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.emergencyRevision = !sign.emergencyRevision;
      if (sign.emergencyRevision) sign.status = "changes";
    });
  });

  const saveVersion = $(() => {
    const sign = project.value.signs.find((item) => item.id === project.value.activeSignId);
    if (!sign) return;
    const versionId = uid("version");
    commit("保存版本快照", (draft) => {
      const current = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!current) return;
      current.versions.unshift({
        id: versionId,
        label: `版本 ${current.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        sourceText: current.sourceText,
        targetText: current.targetText,
        status: current.status,
        terms: cloneTerms(current.terms),
      });
      current.versions = current.versions.slice(0, 12);
    });
    selectedVersionId.value = versionId;
    toast.value = "版本快照已保存";
  });

  const addTerm = $(() => {
    const source = termSource.value.trim();
    const target = termTarget.value.trim();
    if (!source || !target) return;
    updateActive("绑定术语", (sign) => {
      sign.terms.push({ id: uid("term"), source, target, required: true, confirmed: false });
      sign.status = "pending";
    });
    termSource.value = "";
    termTarget.value = "";
  });

  const addComment = $(() => {
    const body = commentDraft.value.trim();
    if (!body) return;
    updateActive("添加审校意见", (sign) => {
      sign.comments.unshift({
        id: uid("comment"),
        author: "当前审校员",
        body,
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: [],
      });
      sign.status = sign.status === "confirmed" ? "changes" : sign.status;
    });
    commentDraft.value = "";
  });

  const addReply = $((commentId: string) => {
    const body = replyDraft.value.trim();
    if (!body) return;
    updateActive("回复审校意见", (sign) => {
      const comment = sign.comments.find((item) => item.id === commentId);
      comment?.replies.push({ id: uid("reply"), author: "当前审校员", body, createdAt: new Date().toISOString() });
    });
    replyDraft.value = "";
    replyingTo.value = "";
  });

  const sharePreview: QRL<() => void> = $(() => {
    const current = project.value.signs.find((item) => item.id === project.value.activeSignId);
    if (!current) return;
    const url = `${window.location.origin}${window.location.pathname}?preview=${encodeURIComponent(current.id)}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.value = "只读预览链接已复制";
  });

  // 切换标识的校对宽度档 / 字号（范围由所属场景规格限定）。
  const setPreviewWidth = $((width: number) => {
    updateActive("切换预览宽度", (sign) => { sign.layoutWidth = width; });
  });
  const setPreviewFont = $((font: number) => {
    updateActive("调整预览字号", (sign, draft) => {
      const spec = draft.scenarios.find((item) => item.id === sign.scenarioId);
      sign.layoutFont = spec ? Math.min(spec.maxFont, Math.max(spec.minFont, font)) : font;
    });
  });
  const changeScenario = $((scenarioId: string) => {
    commit("更换适用场景", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.scenarioId = scenarioId;
      const spec = draft.scenarios.find((item) => item.id === scenarioId);
      const clamped = clampLayout(spec, sign.layoutWidth, sign.layoutFont);
      sign.layoutWidth = clamped.width;
      sign.layoutFont = clamped.font;
    });
  });

  const startEditSpec = $((specId: string) => {
    if (specId === "new") {
      editingSpecId.value = "new";
      draftName.value = "新场景";
      draftWidths.value = "320, 480, 640";
      draftMinFont.value = 28;
      draftMaxFont.value = 64;
      draftMaxLines.value = 3;
      return;
    }
    const spec = findSpec(specId);
    if (!spec) return;
    editingSpecId.value = specId;
    draftName.value = spec.name;
    draftWidths.value = spec.widths.join(", ");
    draftMinFont.value = spec.minFont;
    draftMaxFont.value = spec.maxFont;
    draftMaxLines.value = spec.maxLines;
  });

  const cancelEditSpec = $(() => { editingSpecId.value = ""; });

  // 规格一改，套用它的标识全部按新规格重算；原本版面安全、现在溢出的标识标高风险并退回待确认。
  const saveSpec = $(() => {
    const name = draftName.value.trim();
    const widths = draftWidths.value
      .split(/[,，\s]+/)
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!name || !widths.length) {
      toast.value = "请填写场景名称和至少一个可用宽度";
      return;
    }
    if (draftMinFont.value >= draftMaxFont.value || draftMaxLines.value < 1) {
      toast.value = "字号下限须小于上限，且至少允许一行";
      return;
    }

    const isNew = editingSpecId.value === "new";
    const oldSpec = isNew ? undefined : findSpec(editingSpecId.value);
    if (!isNew && !oldSpec) return;

    // 先在草稿上重算并统计被退回的已确认标识，再入栈历史。
    const draft = structuredClone(project.value);
    const now = new Date().toISOString();
    let reverted = 0;
    let savedName = name;
    if (isNew) {
      draft.scenarios.push({
        id: uid("scn"),
        name,
        widths,
        minFont: draftMinFont.value,
        maxFont: draftMaxFont.value,
        maxLines: draftMaxLines.value,
        updatedAt: now,
      });
    } else {
      const spec = draft.scenarios.find((item) => item.id === oldSpec!.id);
      if (!spec) return;
      const nextSpec: LayoutSpec = {
        ...spec,
        name,
        widths,
        minFont: draftMinFont.value,
        maxFont: draftMaxFont.value,
        maxLines: draftMaxLines.value,
        updatedAt: now,
      };
      for (const sign of draft.signs.filter((item) => item.scenarioId === spec.id)) {
        const before = analyzeSign(sign, spec, sign.layoutWidth, sign.layoutFont);
        const clamped = clampLayout(nextSpec, sign.layoutWidth, sign.layoutFont);
        sign.layoutWidth = clamped.width;
        sign.layoutFont = clamped.font;
        const after = analyzeSign(sign, nextSpec, sign.layoutWidth, sign.layoutFont);
        // 原来按旧规格不判高风险（版面安全或接近边界），新规格下溢出即标高风险并退回待确认。
        if (before.risk !== "high" && (after.overflow || after.tooLong) && sign.status === "confirmed") {
          sign.status = "pending";
          reverted += 1;
        }
      }
      Object.assign(spec, nextSpec);
      savedName = spec.name;
    }
    draft.updatedAt = now;
    past.value = [...past.value.slice(-49), structuredClone(project.value)];
    future.value = [];
    project.value = draft;

    editingSpecId.value = "";
    toast.value = isNew
      ? `场景「${savedName}」已新增`
      : reverted
        ? `规格已更新，${reverted} 条已确认标识因溢出退回待确认`
        : `场景「${savedName}」规格已更新，套用标识已重算`;
  });

  const deleteSpec = $((specId: string) => {
    const spec = findSpec(specId);
    if (!spec) return;
    const used = project.value.signs.filter((sign) => sign.scenarioId === specId).length;
    if (used) {
      toast.value = `还有 ${used} 条标识使用该场景，不能删除`;
      return;
    }
    commit("删除场景规格", (draft) => {
      draft.scenarios = draft.scenarios.filter((item) => item.id !== specId);
    });
    if (editingSpecId.value === specId) editingSpecId.value = "";
    toast.value = `场景「${spec.name}」已删除`;
  });

  const openSignFromScenario = $((signId: string) => {
    commit("切换标识", (draft) => { draft.activeSignId = signId; });
    selectedVersionId.value = "";
    tab.value = "review";
  });

  const selectedVersion = () => active().versions.find((version) => version.id === selectedVersionId.value) ?? active().versions[0];
  const comparison = () => {
    const version = selectedVersion();
    return version ? diffText(version.targetText, active().targetText) : [];
  };

  useVisibleTask$(({ track }) => {
    track(() => hydrated.value);
    if (!hydrated.value) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as { schema: number; project: SignProject };
          if (stored.schema === 2 && stored.project?.signs?.length) project.value = stored.project;
        } else {
          const legacyRaw = localStorage.getItem("sologsb-1008-project-v1");
          if (legacyRaw) {
            const migrated = migrateProject(JSON.parse(legacyRaw));
            if (migrated) project.value = migrated;
          }
        }
        const requestedPreview = new URLSearchParams(window.location.search).get("preview") ?? "";
        previewId.value = requestedPreview;
        readOnly.value = Boolean(requestedPreview);
      } catch {
        // Keep bundled sample data when storage is unavailable or malformed.
      }
      hydrated.value = true;
    }
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => hydrated.value);
    if (!hydrated.value) return;
    track(() => project.value);
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 2, project: project.value }));
    }, 450);
    cleanup(() => window.clearTimeout(timer));
  });

  useVisibleTask$(({ cleanup }) => {
    const updateOnline = () => { online.value = navigator.onLine; };
    updateOnline();
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const current = project.value.signs.find((sign) => sign.id === project.value.activeSignId);
      const spec = current ? project.value.scenarios.find((item) => item.id === current.scenarioId) : undefined;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "z") {
          event.preventDefault();
          undo();
        }
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        navigateSign(1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigateSign(-1);
      } else if (event.key === "[" && current && spec) {
        const index = spec.widths.indexOf(current.layoutWidth);
        const next = spec.widths[Math.max(0, (index < 0 ? 0 : index) - 1)];
        if (next !== undefined) setPreviewWidth(next);
      } else if (event.key === "]" && current && spec) {
        const index = spec.widths.indexOf(current.layoutWidth);
        const next = spec.widths[Math.min(spec.widths.length - 1, (index < 0 ? 0 : index) + 1)];
        if (next !== undefined) setPreviewWidth(next);
      } else if (event.key === "-" && current) {
        setPreviewFont(current.layoutFont - 2);
      } else if (event.key === "=" && current) {
        setPreviewFont(current.layoutFont + 2);
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("keydown", keydown);
    cleanup(() => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("keydown", keydown);
    });
  });

  if (readOnly.value) {
    const sign = active();
    const spec = activeSpec();
    const analysis = preview();
    return (
      <main data-theme="corporate" class="min-h-screen bg-slate-100 p-6">
        <div class="mx-auto max-w-5xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Read-only preview</div>
              <h1 class="text-2xl font-bold text-slate-800">{sign.code} · {spec?.name ?? "未指定场景"}</h1>
            </div>
            <span class={`badge ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
          </div>
          <section class="rounded-3xl bg-white p-14 shadow-xl">
            <div class="mb-3 text-center text-xs text-slate-400">中文原文</div>
            <p class="mx-auto mb-10 max-w-2xl text-center text-lg text-slate-600">{sign.sourceText}</p>
            <div class="mx-auto border-y-4 border-slate-800 py-10 text-center">
              <p class="whitespace-pre-line font-black leading-tight tracking-wide text-slate-900" style={{ fontSize: `${sign.layoutFont}px` }}>{analysis.visible.join("\n")}</p>
            </div>
            <div class="mt-5 text-center text-sm text-slate-500">
              {sign.targetLanguage} · {sign.regulation}
              {spec && <span class="ml-2 badge badge-ghost badge-sm">{specSummary(spec)}</span>}
            </div>
          </section>
          <p class="mt-4 text-center text-xs text-slate-400">此链接读取当前浏览器中的本地版本，仅用于演示只读预览。</p>
        </div>
      </main>
    );
  }

  const editingSpec = editingSpecId.value === "new" ? undefined : findSpec(editingSpecId.value);

  return (
    <div data-theme="corporate" class="min-h-screen bg-slate-100 pb-9 text-slate-800">
      <header class="navbar sticky top-0 z-40 min-h-16 border-b border-slate-700 bg-[#17324d] px-5 text-white shadow-lg">
        <div class="navbar-start gap-3">
          <div class="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 font-black">译</div>
          <div>
            <div class="text-xs uppercase tracking-[0.2em] text-sky-200">Public Sign Review</div>
            <div class="font-bold">公共标识多语言校对台</div>
          </div>
        </div>
        <div class="navbar-center hidden xl:flex">
          <input
            class="input input-sm w-80 border-white/15 bg-white/10 text-white placeholder:text-slate-300"
            value={project.value.title}
            onInput$={(_, element) => commit("修改项目名称", (draft) => { draft.title = element.value; })}
            aria-label="项目名称"
          />
        </div>
        <div class="navbar-end gap-2">
          <span class={`badge ${online.value ? "badge-success" : "badge-warning"} badge-outline`}>{online.value ? "在线" : "离线草稿"}</span>
          <button class="btn btn-ghost btn-sm" disabled={!past.value.length} onClick$={undo}>撤销</button>
          <button class="btn btn-ghost btn-sm" disabled={!future.value.length} onClick$={redo}>重做</button>
          <button class="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20" onClick$={sharePreview}>复制只读链接</button>
          <button class={`btn btn-sm ${active().emergencyRevision ? "btn-error" : "btn-warning"}`} onClick$={toggleEmergency}>
            {active().emergencyRevision ? "退出紧急修订" : "紧急修订"}
          </button>
        </div>
      </header>

      <div class="tabs tabs-box fixed inset-x-0 top-16 z-30 mx-auto w-fit gap-1 bg-white/95 shadow">
        <button class={`tab ${tab.value === "review" ? "tab-active" : ""}`} onClick$={() => { tab.value = "review"; }}>标识校对</button>
        <button class={`tab ${tab.value === "scenarios" ? "tab-active" : ""}`} onClick$={() => { tab.value = "scenarios"; editingSpecId.value = ""; }}>
          场景规格<span class="badge badge-sm ml-1">{project.value.scenarios.length}</span>
        </button>
      </div>

      {tab.value === "review" && active().emergencyRevision && (
        <div class="alert alert-error sticky top-28 z-20 rounded-none border-x-0 py-2 text-white">
          <span class="text-lg">!</span>
          <span><strong>紧急修订模式</strong>：确认操作已锁定，修改后必须重新审校并保存版本。</span>
        </div>
      )}

      {tab.value === "scenarios" ? (
        <main class="mx-auto max-w-5xl px-6 pb-16 pt-24">
          <div class="mb-5 flex items-end justify-between">
            <div>
              <h1 class="text-2xl font-bold">场景版面规格</h1>
              <p class="mt-1 text-sm text-slate-500">
                每个场景记录可用宽度档、字号上下限和最多行数。标识按所属场景套用规格计算风险；规格修改后，套用它的标识全部重算，原来不判高风险、按新规格溢出的已确认标识会退回待确认。
              </p>
            </div>
            <button class="btn btn-primary btn-sm" onClick$={() => startEditSpec("new")}>新增场景</button>
          </div>

          {(editingSpecId.value === "new" || editingSpec) && (
            <section class="card mb-5 border-2 border-blue-300 bg-blue-50/40 shadow-sm">
              <div class="card-body p-5">
                <h2 class="font-bold">{editingSpecId.value === "new" ? "新增场景规格" : `编辑规格 · ${editingSpec?.name ?? ""}`}</h2>
                <div class="grid grid-cols-2 gap-4">
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">场景名称</span>
                    <input class="input input-bordered" value={draftName.value} onInput$={(_, el) => draftName.value = el.value} />
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">可用宽度档（逗号分隔，像素）</span>
                    <input class="input input-bordered font-mono text-sm" placeholder="320, 480, 640" value={draftWidths.value} onInput$={(_, el) => draftWidths.value = el.value} />
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">字号下限 {draftMinFont.value}px</span>
                    <input type="number" min="10" max="200" class="input input-bordered" value={draftMinFont.value} onInput$={(_, el) => draftMinFont.value = Number(el.value)} />
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">字号上限 {draftMaxFont.value}px</span>
                    <input type="number" min="10" max="300" class="input input-bordered" value={draftMaxFont.value} onInput$={(_, el) => draftMaxFont.value = Number(el.value)} />
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">最多行数</span>
                    <input type="number" min="1" max="20" class="input input-bordered" value={draftMaxLines.value} onInput$={(_, el) => draftMaxLines.value = Number(el.value)} />
                  </label>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  预览：{specSummary({
                    id: "",
                    name: draftName.value || "未命名",
                    widths: draftWidths.value.split(/[,，\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0),
                    minFont: draftMinFont.value,
                    maxFont: draftMaxFont.value,
                    maxLines: draftMaxLines.value,
                    updatedAt: "",
                  })}
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-primary btn-sm" onClick$={saveSpec}>保存规格并重算</button>
                  <button class="btn btn-ghost btn-sm" onClick$={cancelEditSpec}>取消</button>
                </div>
              </div>
            </section>
          )}

          <div class="grid gap-4 md:grid-cols-2">
            {project.value.scenarios.map((spec) => {
              const signs = project.value.signs.filter((sign) => sign.scenarioId === spec.id);
              const high = signs.filter((sign) => signRisk(sign).risk === "high");
              const medium = signs.filter((sign) => signRisk(sign).risk === "medium");
              const pendingOverflow = signs.filter((sign) => sign.status === "pending" && signRisk(sign).overflow);
              return (
                <section key={spec.id} class="card border border-slate-200 bg-white shadow-sm">
                  <div class="card-body p-5">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <h3 class="text-lg font-bold">{spec.name}</h3>
                        <p class="mt-1 font-mono text-xs text-slate-500">{specSummary(spec)}</p>
                        <p class="mt-1 text-[11px] text-slate-400">更新于 {new Date(spec.updatedAt).toLocaleString()}</p>
                      </div>
                      <div class="flex gap-1">
                        <button class="btn btn-xs btn-outline" onClick$={() => startEditSpec(spec.id)}>编辑</button>
                        <button class="btn btn-xs btn-ghost text-error" onClick$={() => deleteSpec(spec.id)}>删除</button>
                      </div>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2 text-xs">
                      <span class="badge badge-ghost">套用 {signs.length} 条</span>
                      <span class={`badge ${high.length ? "badge-error" : "badge-ghost"}`}>高风险 {high.length}</span>
                      <span class={`badge ${medium.length ? "badge-warning" : "badge-ghost"}`}>需留意 {medium.length}</span>
                    </div>
                    {high.length > 0 && (
                      <div class="mt-3 rounded-xl border border-error/30 bg-error/5 p-3">
                        <div class="text-xs font-bold text-error">按当前规格判为高风险的标识（含新规格下溢出、已退回待确认）</div>
                        <ul class="mt-2 space-y-1">
                          {high.map((sign) => (
                            <li key={sign.id}>
                              <button class="flex w-full items-center justify-between gap-2 text-left text-xs hover:underline" onClick$={() => openSignFromScenario(sign.id)}>
                                <span class="font-mono font-bold text-slate-600">{sign.code}</span>
                                <span class="min-w-0 flex-1 truncate">{sign.targetText.split("\n")[0]}</span>
                                <span class={`badge badge-sm ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {pendingOverflow.length > 0 && (
                          <p class="mt-2 text-[11px] text-slate-500">其中 {pendingOverflow.length} 条为溢出的待确认标识；刚保存规格时因溢出被退回的已确认标识会立即在此列表中反映。</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      ) : (
        <div class="grid grid-cols-[270px_minmax(560px,1fr)_430px] gap-px bg-slate-300 pt-12">
          <aside class="overflow-y-auto bg-slate-50 p-3">
            <div class="mb-3 rounded-xl bg-white p-4 shadow-sm">
              <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">标识清单</div>
              <div class="mt-1 text-lg font-bold text-slate-800">{project.value.signs.length} 处标识</div>
              <p class="mt-1 text-xs leading-5 text-slate-500">{project.value.location}</p>
            </div>
            <div class="space-y-2">
              {project.value.signs.map((sign, index) => {
                const spec = findSpec(sign.scenarioId);
                const risk = signRisk(sign);
                return (
                  <button
                    key={sign.id}
                    class={`w-full rounded-xl border p-3 text-left transition ${sign.id === project.value.activeSignId ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    onClick$={() => {
                      commit("切换标识", (draft) => { draft.activeSignId = sign.id; });
                      selectedVersionId.value = "";
                    }}
                  >
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-xs font-bold text-slate-500">{sign.code}</span>
                      <span class={`badge badge-sm ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
                    </div>
                    <div class="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{sign.sourceText}</div>
                    <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span class="truncate">{spec?.name ?? "未指定场景"}</span>
                      <span class={riskClass(risk.risk)}>{riskLabel(risk.risk)}</span>
                    </div>
                    <span class="sr-only">第 {index + 1} 条</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main class="min-w-0 bg-white">
            <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div class="flex items-start justify-between gap-5">
                <div>
                  <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{active().code} · {activeSpec()?.name ?? "未指定场景"}</div>
                  <h1 class="mt-1 text-xl font-bold">中文原文与译文校对</h1>
                </div>
                <div class="join">
                  {(["draft", "pending", "changes", "confirmed"] as ReviewStatus[]).map((status) => (
                    <button key={status} class={`btn join-item btn-sm ${active().status === status ? "btn-primary" : "btn-outline"}`} onClick$={() => setStatus(status)}>{STATUS_LABELS[status]}</button>
                  ))}
                </div>
              </div>
            </div>

            <div class="space-y-5 p-6">
              <section class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body gap-4 p-5">
                  <div class="flex items-center justify-between">
                    <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Source</div><h2 class="font-bold">中文原文</h2></div>
                    <span class="badge badge-ghost">简体中文</span>
                  </div>
                  <textarea
                    class="textarea textarea-bordered min-h-24 w-full text-base leading-7"
                    value={active().sourceText}
                    onInput$={(_, element) => updateActive("修改中文原文", (sign) => { sign.sourceText = element.value; sign.status = "draft"; })}
                  />
                </div>
              </section>

              <section class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body gap-4 p-5">
                  <div class="grid grid-cols-2 gap-4">
                    <label class="form-control">
                      <span class="label-text mb-1 text-xs font-bold text-slate-500">目标语言</span>
                      <select class="select select-bordered" value={active().targetLanguage} onChange$={(_, element) => updateActive("修改目标语言", (sign) => { sign.targetLanguage = element.value; sign.status = "pending"; })}>
                        {["English", "日本語", "Français", "Deutsch", "한국어", "Español"].map((language) => <option key={language}>{language}</option>)}
                      </select>
                    </label>
                    <label class="form-control">
                      <span class="label-text mb-1 text-xs font-bold text-slate-500">适用场景（决定版面规格）</span>
                      <select class="select select-bordered" value={active().scenarioId} onChange$={(_, element) => changeScenario(element.value)}>
                        {project.value.scenarios.map((spec) => <option key={spec.id} value={spec.id}>{spec.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {activeSpec() ? (
                    <div class="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                      当前场景规格：<span class="font-mono">{specSummary(activeSpec()!)}</span>。标识按此规格预览与判风险。
                    </div>
                  ) : (
                    <div class="alert alert-warning py-2 text-xs">该标识未匹配到场景规格，风险计算使用默认宽度档（320/480/720/960、字号 28–88、3 行）。</div>
                  )}
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">法规或规范提示</span>
                    <input class="input input-bordered" value={active().regulation} onInput$={(_, element) => updateActive("修改法规提示", (sign) => { sign.regulation = element.value; })} />
                  </label>
                  <div class="divider my-0"></div>
                  <div class="flex items-center justify-between">
                    <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Target</div><h2 class="font-bold">目标语言译文</h2></div>
                    <button class="btn btn-sm btn-outline" onClick$={saveVersion}>保存版本快照</button>
                  </div>
                  <textarea
                    class="textarea textarea-bordered min-h-36 w-full text-lg leading-8"
                    value={active().targetText}
                    onInput$={(_, element) => updateActive("修改译文", (sign) => { sign.targetText = element.value; sign.status = sign.emergencyRevision ? "changes" : "pending"; })}
                  />
                  <div class="flex flex-wrap gap-2">
                    {active().terms.map((term) => {
                      const matched = active().targetText.toLocaleLowerCase().includes(term.target.toLocaleLowerCase());
                      return (
                        <button
                          key={term.id}
                          title="点击切换术语确认状态"
                          class={`badge badge-lg gap-1 ${matched && term.confirmed ? "badge-success" : matched ? "badge-warning" : "badge-error"}`}
                          onClick$={() => updateActive("确认术语", (sign) => {
                            const current = sign.terms.find((item) => item.id === term.id);
                            if (current) current.confirmed = !current.confirmed;
                          })}
                        >
                          {term.source} → {term.target} {matched ? (term.confirmed ? "✓" : "!") : "×"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body p-5">
                  <div class="flex items-center justify-between">
                    <div><h2 class="font-bold">术语绑定</h2><p class="text-xs text-slate-500">必选术语未出现在译文中时会实时告警。</p></div>
                    <span class="badge badge-outline">{active().terms.length} 条</span>
                  </div>
                  <div class="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input class="input input-sm input-bordered" placeholder="中文术语" value={termSource.value} onInput$={(_, element) => termSource.value = element.value} />
                    <input class="input input-sm input-bordered" placeholder="目标语言固定译法" value={termTarget.value} onInput$={(_, element) => termTarget.value = element.value} />
                    <button class="btn btn-sm btn-primary" onClick$={addTerm}>绑定</button>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    {active().terms.map((term) => (
                      <div key={term.id} class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <div class="min-w-0">
                          <div class="truncate text-xs font-bold">{term.source}</div>
                          <div class="truncate text-xs text-slate-500">{term.target}</div>
                        </div>
                        <div class="flex gap-1">
                          <button class={`btn btn-xs ${term.confirmed ? "btn-success" : "btn-ghost"}`} onClick$={() => updateActive("确认术语", (sign) => { const target = sign.terms.find((item) => item.id === term.id); if (target) target.confirmed = !target.confirmed; })}>确认</button>
                          <button class="btn btn-xs btn-ghost text-error" onClick$={() => updateActive("删除术语", (sign) => { sign.terms = sign.terms.filter((item) => item.id !== term.id); })}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body p-5">
                  <h2 class="font-bold">审校意见与回复</h2>
                  <div class="mt-3 flex gap-2">
                    <textarea class="textarea textarea-bordered min-h-20 flex-1" placeholder="记录措辞、文化适配或法规依据…" value={commentDraft.value} onInput$={(_, element) => commentDraft.value = element.value} />
                    <button class="btn btn-primary self-end" onClick$={addComment}>添加意见</button>
                  </div>
                  <div class="mt-4 space-y-3">
                    {active().comments.length === 0 && <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">还没有审校意见。</div>}
                    {active().comments.map((comment) => (
                      <article key={comment.id} class={`rounded-xl border-l-4 bg-slate-50 p-3 ${comment.resolved ? "border-success opacity-60" : "border-warning"}`}>
                        <div class="flex items-center justify-between text-xs"><strong>{comment.author}</strong><span class="text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
                        <p class="my-2 text-sm">{comment.body}</p>
                        {comment.replies.map((reply) => (
                          <div key={reply.id} class="ml-4 my-1 border-l-2 border-slate-200 pl-3 text-xs"><strong>{reply.author}</strong>：{reply.body}</div>
                        ))}
                        {replyingTo.value === comment.id ? (
                          <div class="mt-2 flex gap-2">
                            <input class="input input-xs input-bordered flex-1" value={replyDraft.value} onInput$={(_, element) => replyDraft.value = element.value} />
                            <button class="btn btn-xs btn-primary" onClick$={() => addReply(comment.id)}>发送</button>
                          </div>
                        ) : (
                          <div class="mt-2 flex gap-2">
                            <button class="btn btn-xs btn-ghost" onClick$={() => { replyingTo.value = comment.id; }}>回复</button>
                            <button class="btn btn-xs btn-ghost" onClick$={() => updateActive("更新意见状态", (sign) => { const item = sign.comments.find((entry) => entry.id === comment.id); if (item) item.resolved = !item.resolved; })}>{comment.resolved ? "重新打开" : "标记已解决"}</button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </main>

          <aside class="overflow-y-auto bg-slate-50 p-4">
            <section class="sticky top-20 space-y-4">
              <div class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Live Preview</div>
                      <h2 class="font-bold">版面实时预览</h2>
                      <div class="text-[11px] text-slate-500">{activeSpec()?.name ?? "默认规格"}</div>
                    </div>
                    <span class={`badge ${preview().risk === "high" ? "badge-error" : preview().risk === "medium" ? "badge-warning" : "badge-success"}`}>
                      {preview().risk === "high" ? "溢出风险" : preview().risk === "medium" ? "接近边界" : "版面安全"}
                    </span>
                  </div>
                  {activeSpec() ? (
                    <>
                      <div class="mt-3 flex flex-wrap gap-1">
                        {activeSpec()!.widths.map((width) => (
                          <button key={width} class={`btn btn-xs ${active().layoutWidth === width ? "btn-primary" : "btn-outline"}`} onClick$={() => setPreviewWidth(width)}>{width}px</button>
                        ))}
                      </div>
                      <div class="mt-2 flex items-center gap-3 text-xs">
                        <span class="w-24">字号 {active().layoutFont}px</span>
                        <input
                          type="range"
                          min={activeSpec()!.minFont}
                          max={activeSpec()!.maxFont}
                          step="2"
                          class="range range-primary range-xs flex-1"
                          value={active().layoutFont}
                          onInput$={(_, element) => setPreviewFont(Number(element.value))}
                        />
                      </div>
                      <div class="text-[11px] text-slate-400">规格范围 {activeSpec()!.minFont}–{activeSpec()!.maxFont}px · 最多 {activeSpec()!.maxLines} 行</div>
                    </>
                  ) : (
                    <div class="mt-3 text-xs text-slate-400">未匹配场景，使用默认宽度档与字号范围。</div>
                  )}
                  <div class="mt-4 overflow-hidden rounded-xl bg-slate-800 p-3">
                    <div class="mx-auto grid min-h-48 place-items-center overflow-hidden border-4 border-white bg-[#174f3d] p-3 text-center text-white" style={{ width: `${active().layoutWidth}px`, maxWidth: "100%" }}>
                      <div>
                        <div style={{ fontSize: `${active().layoutFont}px` }} class="font-black leading-[1.18] tracking-wide">{preview().visible.map((line, index) => <div key={index}>{line || " "}</div>)}</div>
                      </div>
                    </div>
                  </div>
                  <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{preview().lines.length}</strong><span>预计行数{activeSpec() ? `/${activeSpec()!.maxLines}` : ""}</span></div>
                    <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{active().targetText.length}</strong><span>字符数</span></div>
                    <div class="rounded-lg bg-slate-100 p-2"><strong class={`block text-lg ${preview().missingTerms.length ? "text-error" : "text-success"}`}>{preview().missingTerms.length}</strong><span>缺失术语</span></div>
                  </div>
                  {(preview().overflow || preview().tooLong) && (
                    <div class="alert alert-error mt-3 py-2 text-xs">
                      {preview().overflow ? `内容预计 ${preview().lines.length} 行，超过场景最多 ${activeSpec()?.maxLines ?? 3} 行，可能截断。` : "译文接近当前规格下的建议字符上限。"}
                    </div>
                  )}
                </div>
              </div>

              <div class="card border border-slate-200 bg-white shadow-sm">
                <div class="card-body p-4">
                  <div class="flex items-center justify-between">
                    <div><h2 class="font-bold">版本比较</h2><p class="text-xs text-slate-500">旧版快照与当前译文逐词对比。</p></div>
                    <span class="badge badge-outline">{active().versions.length} 版</span>
                  </div>
                  {active().versions.length ? (
                    <>
                      <select class="select select-sm select-bordered mt-3 w-full" value={selectedVersionId.value || active().versions[0].id} onChange$={(_, element) => selectedVersionId.value = element.value}>
                        {active().versions.map((version) => <option key={version.id} value={version.id}>{`${version.label} · ${new Date(version.createdAt).toLocaleTimeString()}`}</option>)}
                      </select>
                      <div class="mt-3 rounded-lg bg-slate-900 p-3 text-sm leading-7 text-slate-100">
                        {comparison().map((token, index) => (
                          <span key={index} class={token.type === "add" ? "rounded bg-green-400/25 text-green-200" : token.type === "remove" ? "bg-red-400/25 text-red-200 line-through" : ""}>{token.value}</span>
                        ))}
                      </div>
                      <div class="mt-2 flex gap-3 text-[11px]"><span class="text-green-700">绿：新增</span><span class="text-red-700">红：删除</span></div>
                    </>
                  ) : (
                    <div class="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">保存当前译文后会在这里生成可比较版本。</div>
                  )}
                </div>
              </div>

              <div class="rounded-xl bg-[#17324d] p-4 text-xs text-slate-200">
                <div class="mb-2 font-bold text-white">键盘操作</div>
                <div class="grid grid-cols-2 gap-y-1"><span><kbd class="kbd kbd-xs">J/K</kbd> 切换标识</span><span><kbd class="kbd kbd-xs">[ ]</kbd> 场景宽度档</span><span><kbd class="kbd kbd-xs">- =</kbd> 规格内字号</span><span><kbd class="kbd kbd-xs">Ctrl/⌘ Z</kbd> 撤销</span></div>
              </div>
            </section>
          </aside>
        </div>
      )}

      {toast.value && (
        <div class="toast toast-end z-50 cursor-pointer" onClick$={() => toast.value = ""}>
          <div class="alert alert-success"><span>{toast.value}</span></div>
        </div>
      )}
    </div>
  );
});
