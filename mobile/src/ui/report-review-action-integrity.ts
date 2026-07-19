import {
  DIRECTION_MIX_REPORT_DEFINITION_SHA256,
  DIRECTION_MIX_REPORT_VERSION,
  buildDirectionMixReport,
} from "../core/direction-mix-report";
import {
  EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
  EMOTION_PATTERNS_REPORT_VERSION,
  buildEmotionPatternsReport,
} from "../core/emotion-patterns-report";
import {
  MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
  MISTAKE_PATTERNS_REPORT_VERSION,
  buildMistakePatternsReport,
} from "../core/mistake-patterns-report";
import {
  OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256,
  OPENING_WEEKDAY_MIX_REPORT_VERSION,
  buildOpeningWeekdayMixReport,
} from "../core/opening-weekday-mix-report";
import {
  PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
  PLAN_ADHERENCE_REPORT_VERSION,
  buildPlanAdherenceReport,
} from "../core/plan-adherence-report";
import {
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
  REVIEW_SESSION_COVERAGE_REPORT_VERSION,
  buildReviewSessionCoverageReport,
} from "../core/review-session-coverage-report";
import {
  SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
  SETUP_PERFORMANCE_REPORT_VERSION,
  buildSetupPerformanceReport,
} from "../core/setup-performance-report";
import {
  TAG_PATTERNS_REPORT_DEFINITION_SHA256,
  TAG_PATTERNS_REPORT_VERSION,
  buildTagPatternsReport,
} from "../core/tag-patterns-report";
import type { JournalWorkspaceSnapshot } from "../core/types";
import type { TradeReviewReportSource } from "./trade-review-sheet";

type RegisteredReportSource = Exclude<
  TradeReviewReportSource,
  "symbol-breakdown"
>;

interface ExpectedEvidenceIdentity {
  readonly tradeSubjectId: string;
  readonly domIdentity: string;
}

interface ExpectedGroupIdentity {
  readonly domIdentity: string;
  readonly evidenceListDomIdentity: string;
  readonly evidence: readonly ExpectedEvidenceIdentity[];
}

interface ReportDomContract {
  readonly sectionSelector: string;
  readonly groupSelector: string;
  readonly evidenceListSelector: string;
  readonly evidenceSelector: string;
  readonly evidenceMoreSelector: string;
  readonly groupMoreSelector: string | null;
  readonly groupPageSize: number | null;
  readonly groupDomIdentity: (group: HTMLElement) => string | null;
  readonly evidenceListDomIdentity: (list: HTMLElement) => string | null;
  readonly evidenceDomIdentity: (row: HTMLElement) => string | null;
}

interface ExpectedReportIdentity {
  readonly source: RegisteredReportSource;
  readonly dom: ReportDomContract;
  readonly groups: readonly ExpectedGroupIdentity[];
}

interface RegisteredReportActionIdentity {
  readonly source: RegisteredReportSource;
  readonly tradeSubjectId: string;
  readonly groupIndex: number;
  readonly evidenceIndex: number;
  readonly groupDomIdentity: string;
  readonly evidenceListDomIdentity: string;
  readonly evidenceDomIdentity: string;
  readonly section: HTMLElement;
  readonly group: HTMLElement;
  readonly evidenceList: HTMLElement;
  readonly evidenceRow: HTMLElement;
}

interface RegisteredReportGroupState {
  readonly group: HTMLElement;
  readonly evidenceList: HTMLElement;
  readonly evidenceMore: HTMLButtonElement;
  readonly rows: HTMLElement[];
  readonly actions: HTMLButtonElement[];
}

interface RegisteredReportSectionState {
  readonly section: HTMLElement;
  readonly groups: RegisteredReportGroupState[];
  readonly groupMore: HTMLButtonElement | null;
  readonly paginationControls: Set<HTMLButtonElement>;
  liveValid: boolean;
  poisoned: boolean;
}

const EVIDENCE_PAGE_SIZE = 25;
const GROUP_PAGE_SIZE = 5;

const registeredReportActionIdentities = new WeakMap<
  HTMLButtonElement,
  RegisteredReportActionIdentity
>();

const registeredReportSections = new WeakMap<
  HTMLElement,
  Map<RegisteredReportSource, RegisteredReportSectionState | null>
>();

type ReportPaginationOperation =
  | Readonly<{ kind: "evidence"; groupIndex: number }>
  | Readonly<{ kind: "groups" }>;

const registeredReportPaginationControls = new WeakMap<
  HTMLButtonElement,
  Readonly<{
    source: RegisteredReportSource;
    section: HTMLElement;
    operation: ReportPaginationOperation;
  }>
>();

function indexedIdentity(index: number | string, semantic: string): string {
  return JSON.stringify([String(index), semantic]);
}

function domIndexedIdentity(
  element: HTMLElement,
  indexAttribute: string,
  semantic: string | null,
): string | null {
  const index = element.getAttribute(indexAttribute);
  return index === null || semantic === null
    ? null
    : indexedIdentity(index, semantic);
}

function summaryLabel(group: HTMLElement): string | null {
  const labels = Array.from(group.querySelectorAll<HTMLElement>(
    ":scope > summary .plan-check-summary-label > strong",
  ));
  return labels.length === 1 ? labels[0]?.textContent ?? null : null;
}

function subjectIdentity(
  row: HTMLElement,
  dataKey:
    | "planCheckTrade"
    | "directionMixTrade"
    | "openingWeekdayMixTrade"
    | "mistakePatternsTrade"
    | "emotionPatternsTrade"
    | "tagPatternsTrade"
    | "setupPerformanceTrade",
): string | null {
  return row.dataset[dataKey] ?? null;
}

const REPORT_DOM_CONTRACTS = Object.freeze({
  "plan-check": Object.freeze({
    sectionSelector: "[data-plan-check]",
    groupSelector: "[data-plan-check-group]",
    evidenceListSelector: "[data-plan-check-evidence-list]",
    evidenceSelector: "[data-plan-check-trade]",
    evidenceMoreSelector: "[data-plan-check-more]",
    groupMoreSelector: null,
    groupPageSize: null,
    groupDomIdentity: (group: HTMLElement) => group.dataset.planCheckGroup ?? null,
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.planCheckEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "planCheckTrade"),
  }),
  "direction-mix": Object.freeze({
    sectionSelector: "[data-direction-mix]",
    groupSelector: "[data-direction-mix-group-index]",
    evidenceListSelector: "[data-direction-mix-evidence-list]",
    evidenceSelector: "[data-direction-mix-trade]",
    evidenceMoreSelector: "[data-direction-mix-more]",
    groupMoreSelector: null,
    groupPageSize: null,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-direction-mix-group-index",
      group.dataset.directionMixGroup ?? null,
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.directionMixEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "directionMixTrade"),
  }),
  "opening-weekday-mix": Object.freeze({
    sectionSelector: "[data-opening-weekday-mix]",
    groupSelector: "[data-opening-weekday-mix-group-index]",
    evidenceListSelector: "[data-opening-weekday-mix-evidence-list]",
    evidenceSelector: "[data-opening-weekday-mix-trade]",
    evidenceMoreSelector: "[data-opening-weekday-mix-more]",
    groupMoreSelector: null,
    groupPageSize: null,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-opening-weekday-mix-group-index",
      group.dataset.openingWeekdayMixGroup ?? null,
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.openingWeekdayMixEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => (
      subjectIdentity(row, "openingWeekdayMixTrade")
    ),
  }),
  "review-session-coverage": Object.freeze({
    sectionSelector: "[data-review-session-coverage]",
    groupSelector: "[data-review-session-coverage-group-index]",
    evidenceListSelector: "[data-review-session-coverage-evidence-list]",
    evidenceSelector: "[data-review-session-coverage-trade]",
    evidenceMoreSelector: "[data-review-session-coverage-more]",
    groupMoreSelector: null,
    groupPageSize: null,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-review-session-coverage-group-index",
      group.dataset.reviewSessionCoverageGroup ?? null,
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.reviewSessionCoverageEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => {
      const subject = row.dataset.reviewSessionCoverageTrade;
      const dates = Array.from(row.querySelectorAll<HTMLTimeElement>("time[datetime]"));
      const date = dates.length === 1 ? dates[0]?.dateTime : undefined;
      return subject === undefined || date === undefined
        ? null
        : JSON.stringify([date, subject]);
    },
  }),
  "mistake-patterns": Object.freeze({
    sectionSelector: "[data-mistake-patterns]",
    groupSelector: "[data-mistake-patterns-group-index]",
    evidenceListSelector: "[data-mistake-patterns-evidence-list]",
    evidenceSelector: "[data-mistake-patterns-trade]",
    evidenceMoreSelector: "[data-mistake-patterns-more]",
    groupMoreSelector: "[data-mistake-patterns-groups-more]",
    groupPageSize: GROUP_PAGE_SIZE,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-mistake-patterns-group-index",
      summaryLabel(group),
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.mistakePatternsEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "mistakePatternsTrade"),
  }),
  "emotion-patterns": Object.freeze({
    sectionSelector: "[data-emotion-patterns]",
    groupSelector: "[data-emotion-patterns-group-index]",
    evidenceListSelector: "[data-emotion-patterns-evidence-list]",
    evidenceSelector: "[data-emotion-patterns-trade]",
    evidenceMoreSelector: "[data-emotion-patterns-more]",
    groupMoreSelector: "[data-emotion-patterns-groups-more]",
    groupPageSize: GROUP_PAGE_SIZE,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-emotion-patterns-group-index",
      summaryLabel(group),
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.emotionPatternsEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "emotionPatternsTrade"),
  }),
  "tag-patterns": Object.freeze({
    sectionSelector: "[data-tag-patterns]",
    groupSelector: "[data-tag-patterns-group-index]",
    evidenceListSelector: "[data-tag-patterns-evidence-list]",
    evidenceSelector: "[data-tag-patterns-trade]",
    evidenceMoreSelector: "[data-tag-patterns-more]",
    groupMoreSelector: "[data-tag-patterns-groups-more]",
    groupPageSize: GROUP_PAGE_SIZE,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-tag-patterns-group-index",
      summaryLabel(group),
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.tagPatternsEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "tagPatternsTrade"),
  }),
  "setup-performance": Object.freeze({
    sectionSelector: "[data-setup-performance]",
    groupSelector: "[data-setup-performance-group-index]",
    evidenceListSelector: "[data-setup-performance-evidence-list]",
    evidenceSelector: "[data-setup-performance-trade]",
    evidenceMoreSelector: "[data-setup-performance-more]",
    groupMoreSelector: "[data-setup-performance-groups-more]",
    groupPageSize: GROUP_PAGE_SIZE,
    groupDomIdentity: (group: HTMLElement) => domIndexedIdentity(
      group,
      "data-setup-performance-group-index",
      summaryLabel(group),
    ),
    evidenceListDomIdentity: (list: HTMLElement) => (
      list.dataset.setupPerformanceEvidenceList ?? null
    ),
    evidenceDomIdentity: (row: HTMLElement) => subjectIdentity(row, "setupPerformanceTrade"),
  }),
}) satisfies Readonly<Record<RegisteredReportSource, ReportDomContract>>;

const REGISTERED_REPORT_SOURCES = Object.freeze(
  Object.keys(REPORT_DOM_CONTRACTS) as RegisteredReportSource[],
);

function supportedReport(
  actualVersion: string,
  actualSha256: string,
  expectedVersion: string,
  expectedSha256: string,
): boolean {
  return actualVersion === expectedVersion && actualSha256 === expectedSha256;
}

function expectedReportIdentity(
  snapshot: JournalWorkspaceSnapshot,
  source: RegisteredReportSource,
): ExpectedReportIdentity | null {
  try {
    const dom = REPORT_DOM_CONTRACTS[source];
    switch (source) {
      case "plan-check": {
        const report = buildPlanAdherenceReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          PLAN_ADHERENCE_REPORT_VERSION,
          PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group) => ({
            domIdentity: group.classification,
            evidenceListDomIdentity: group.classification,
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "direction-mix": {
        const report = buildDirectionMixReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          DIRECTION_MIX_REPORT_VERSION,
          DIRECTION_MIX_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.direction),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "opening-weekday-mix": {
        const report = buildOpeningWeekdayMixReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          OPENING_WEEKDAY_MIX_REPORT_VERSION,
          OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.weekday),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "review-session-coverage": {
        const report = buildReviewSessionCoverageReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          REVIEW_SESSION_COVERAGE_REPORT_VERSION,
          REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.classification),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: JSON.stringify([
                evidence.isoDate,
                evidence.tradeSubjectId,
              ]),
            })),
          })),
        };
      }
      case "mistake-patterns": {
        const report = buildMistakePatternsReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          MISTAKE_PATTERNS_REPORT_VERSION,
          MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.mistake),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "emotion-patterns": {
        const report = buildEmotionPatternsReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          EMOTION_PATTERNS_REPORT_VERSION,
          EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.emotion),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "tag-patterns": {
        const report = buildTagPatternsReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          TAG_PATTERNS_REPORT_VERSION,
          TAG_PATTERNS_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.tag),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
      case "setup-performance": {
        const report = buildSetupPerformanceReport(snapshot);
        if (!supportedReport(
          report.metadata.version,
          report.metadata.definitionSha256,
          SETUP_PERFORMANCE_REPORT_VERSION,
          SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
        )) return null;
        return {
          source,
          dom,
          groups: report.groups.map((group, groupIndex) => ({
            domIdentity: indexedIdentity(groupIndex, group.setup),
            evidenceListDomIdentity: String(groupIndex),
            evidence: group.evidence.map((evidence) => ({
              tradeSubjectId: evidence.tradeSubjectId,
              domIdentity: evidence.tradeSubjectId,
            })),
          })),
        };
      }
    }
  } catch {
    return null;
  }
}

function isCompletePrefix(
  renderedCount: number,
  totalCount: number,
  pageSize: number | null,
): boolean {
  if (totalCount === 0) return renderedCount === 0;
  if (pageSize === null) return renderedCount === totalCount;
  return renderedCount > 0
    && renderedCount <= totalCount
    && (renderedCount === totalCount || renderedCount % pageSize === 0);
}

interface InspectedReportGroup {
  readonly group: HTMLElement;
  readonly evidenceList: HTMLElement;
  readonly evidenceMore: HTMLButtonElement;
  readonly rows: readonly HTMLElement[];
  readonly actions: readonly HTMLButtonElement[];
}

interface InspectedReportSection {
  readonly section: HTMLElement;
  readonly expected: ExpectedReportIdentity;
  readonly groups: readonly InspectedReportGroup[];
  readonly groupMore: HTMLButtonElement | null;
}

function sameElements(
  left: readonly Element[],
  right: readonly Element[],
): boolean {
  return left.length === right.length
    && left.every((element, index) => element === right[index]);
}

function inspectReportSection(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  source: RegisteredReportSource,
): InspectedReportSection | null {
  const dom = REPORT_DOM_CONTRACTS[source];
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    dom.sectionSelector,
  ));
  const section = sections[0];
  if (sections.length !== 1 || section === undefined || !root.contains(section)) {
    return null;
  }
  const expected = expectedReportIdentity(snapshot, source);
  if (expected === null) return null;
  const groups = Array.from(section.querySelectorAll<HTMLElement>(
    dom.groupSelector,
  ));
  if (!isCompletePrefix(
    groups.length,
    expected.groups.length,
    dom.groupPageSize,
  )) return null;

  const inspectedGroups: InspectedReportGroup[] = [];
  const inspectedActions: HTMLButtonElement[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const expectedGroup = expected.groups[groupIndex];
    if (
      group === undefined
      || expectedGroup === undefined
      || group.closest(dom.sectionSelector) !== section
      || dom.groupDomIdentity(group) !== expectedGroup.domIdentity
    ) return null;
    const lists = Array.from(group.querySelectorAll<HTMLElement>(
      dom.evidenceListSelector,
    ));
    const evidenceList = lists[0];
    if (
      lists.length !== 1
      || evidenceList === undefined
      || evidenceList.closest(dom.groupSelector) !== group
      || dom.evidenceListDomIdentity(evidenceList)
        !== expectedGroup.evidenceListDomIdentity
    ) return null;
    const evidenceMoreControls = Array.from(
      group.querySelectorAll<HTMLButtonElement>(dom.evidenceMoreSelector),
    );
    const evidenceMore = evidenceMoreControls[0];
    if (
      evidenceMoreControls.length !== 1
      || evidenceMore === undefined
      || evidenceMore.closest(dom.groupSelector) !== group
    ) return null;
    const rows = Array.from(evidenceList.querySelectorAll<HTMLElement>(
      dom.evidenceSelector,
    ));
    const groupRows = Array.from(group.querySelectorAll<HTMLElement>(
      dom.evidenceSelector,
    ));
    if (
      !sameElements(rows, groupRows)
      || !isCompletePrefix(
        rows.length,
        expectedGroup.evidence.length,
        EVIDENCE_PAGE_SIZE,
      )
    ) return null;
    const actions: HTMLButtonElement[] = [];
    for (let evidenceIndex = 0; evidenceIndex < rows.length; evidenceIndex += 1) {
      const row = rows[evidenceIndex];
      const expectedEvidence = expectedGroup.evidence[evidenceIndex];
      if (
        row === undefined
        || expectedEvidence === undefined
        || row.closest(dom.evidenceListSelector) !== evidenceList
        || dom.evidenceDomIdentity(row) !== expectedEvidence.domIdentity
      ) return null;
      const rowActions = Array.from(row.querySelectorAll<HTMLButtonElement>(
        "button.report-trade-action",
      ));
      const action = rowActions[0];
      if (
        rowActions.length !== 1
        || action === undefined
        || action.closest(dom.evidenceSelector) !== row
        || action.dataset.tradeReviewReportSource !== source
        || action.dataset.reviewTrade !== expectedEvidence.tradeSubjectId
      ) return null;
      actions.push(action);
      inspectedActions.push(action);
    }
    inspectedGroups.push(Object.freeze({
      group,
      evidenceList,
      evidenceMore,
      rows,
      actions,
    }));
  }
  const sectionActions = Array.from(section.querySelectorAll<HTMLButtonElement>(
    "button.report-trade-action",
  ));
  if (!sameElements(sectionActions, inspectedActions)) return null;
  const groupMoreControls = dom.groupMoreSelector === null
    ? []
    : Array.from(section.querySelectorAll<HTMLButtonElement>(
      dom.groupMoreSelector,
    ));
  const expectedGroupMoreCount = dom.groupMoreSelector !== null
    && expected.groups.length > 0 ? 1 : 0;
  const groupMore = groupMoreControls[0] ?? null;
  if (
    groupMoreControls.length !== expectedGroupMoreCount
    || (groupMore !== null && groupMore.closest(dom.sectionSelector) !== section)
  ) return null;
  return Object.freeze({
    section,
    expected,
    groups: inspectedGroups,
    groupMore,
  });
}

function registerInspectedAction(
  inspected: InspectedReportSection,
  source: RegisteredReportSource,
  groupIndex: number,
  evidenceIndex: number,
): void {
  const group = inspected.groups[groupIndex];
  const expectedGroup = inspected.expected.groups[groupIndex];
  const row = group?.rows[evidenceIndex];
  const action = group?.actions[evidenceIndex];
  const expectedEvidence = expectedGroup?.evidence[evidenceIndex];
  if (
    group === undefined
    || expectedGroup === undefined
    || row === undefined
    || action === undefined
    || expectedEvidence === undefined
  ) {
    throw new Error("A governed report action could not be captured.");
  }
  registeredReportActionIdentities.set(action, Object.freeze({
    source,
    tradeSubjectId: expectedEvidence.tradeSubjectId,
    groupIndex,
    evidenceIndex,
    groupDomIdentity: expectedGroup.domIdentity,
    evidenceListDomIdentity: expectedGroup.evidenceListDomIdentity,
    evidenceDomIdentity: expectedEvidence.domIdentity,
    section: inspected.section,
    group: group.group,
    evidenceList: group.evidenceList,
    evidenceRow: row,
  }));
}

function createRegisteredSectionState(
  inspected: InspectedReportSection,
  source: RegisteredReportSource,
): RegisteredReportSectionState {
  const paginationControls = new Set<HTMLButtonElement>();
  const registerPaginationControl = (
    control: HTMLButtonElement,
    operation: ReportPaginationOperation,
  ) => {
    paginationControls.add(control);
    registeredReportPaginationControls.set(control, Object.freeze({
      source,
      section: inspected.section,
      operation,
    }));
  };
  const groups = inspected.groups.map((group, groupIndex) => {
    for (let evidenceIndex = 0; evidenceIndex < group.rows.length; evidenceIndex += 1) {
      registerInspectedAction(inspected, source, groupIndex, evidenceIndex);
    }
    registerPaginationControl(group.evidenceMore, Object.freeze({
      kind: "evidence",
      groupIndex,
    }));
    return {
      group: group.group,
      evidenceList: group.evidenceList,
      evidenceMore: group.evidenceMore,
      rows: [...group.rows],
      actions: [...group.actions],
    };
  });
  if (inspected.groupMore !== null) {
    registerPaginationControl(
      inspected.groupMore,
      Object.freeze({ kind: "groups" }),
    );
  }
  return {
    section: inspected.section,
    groups,
    groupMore: inspected.groupMore,
    paginationControls,
    liveValid: true,
    poisoned: false,
  };
}

function hasRegisteredStructuralPrefix(
  root: HTMLElement,
  source: RegisteredReportSource,
  state: RegisteredReportSectionState,
): boolean {
  const dom = REPORT_DOM_CONTRACTS[source];
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    dom.sectionSelector,
  ));
  if (sections.length !== 1 || sections[0] !== state.section) return false;
  const groups = Array.from(state.section.querySelectorAll<HTMLElement>(
    dom.groupSelector,
  ));
  if (groups.length < state.groups.length) return false;
  if (dom.groupMoreSelector !== null) {
    const groupMoreControls = Array.from(
      state.section.querySelectorAll<HTMLButtonElement>(dom.groupMoreSelector),
    );
    const expectedCount = state.groupMore === null ? 0 : 1;
    if (
      groupMoreControls.length !== expectedCount
      || (state.groupMore !== null && groupMoreControls[0] !== state.groupMore)
    ) return false;
  }
  for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex += 1) {
    const registeredGroup = state.groups[groupIndex];
    const group = groups[groupIndex];
    if (registeredGroup === undefined || group !== registeredGroup.group) return false;
    const lists = Array.from(group.querySelectorAll<HTMLElement>(
      dom.evidenceListSelector,
    ));
    if (lists.length !== 1 || lists[0] !== registeredGroup.evidenceList) return false;
    const evidenceMoreControls = Array.from(
      group.querySelectorAll<HTMLButtonElement>(dom.evidenceMoreSelector),
    );
    if (
      evidenceMoreControls.length !== 1
      || evidenceMoreControls[0] !== registeredGroup.evidenceMore
    ) return false;
    const rows = Array.from(registeredGroup.evidenceList.querySelectorAll<HTMLElement>(
      dom.evidenceSelector,
    ));
    const groupRows = Array.from(group.querySelectorAll<HTMLElement>(
      dom.evidenceSelector,
    ));
    if (
      !sameElements(rows, groupRows)
      || rows.length < registeredGroup.rows.length
    ) return false;
    for (
      let evidenceIndex = 0;
      evidenceIndex < registeredGroup.rows.length;
      evidenceIndex += 1
    ) {
      const registeredRow = registeredGroup.rows[evidenceIndex];
      const registeredAction = registeredGroup.actions[evidenceIndex];
      if (
        registeredRow === undefined
        || registeredAction === undefined
        || rows[evidenceIndex] !== registeredRow
      ) return false;
      const actions = Array.from(registeredRow.querySelectorAll<HTMLButtonElement>(
        "button.report-trade-action",
      ));
      if (actions.length !== 1 || actions[0] !== registeredAction) return false;
    }
  }
  return true;
}

function extendRegisteredSectionState(
  inspected: InspectedReportSection,
  source: RegisteredReportSource,
  state: RegisteredReportSectionState,
): void {
  for (let groupIndex = 0; groupIndex < inspected.groups.length; groupIndex += 1) {
    const inspectedGroup = inspected.groups[groupIndex];
    if (inspectedGroup === undefined) continue;
    const registeredGroup = state.groups[groupIndex];
    if (registeredGroup === undefined) {
      const appended: RegisteredReportGroupState = {
        group: inspectedGroup.group,
        evidenceList: inspectedGroup.evidenceList,
        evidenceMore: inspectedGroup.evidenceMore,
        rows: [],
        actions: [],
      };
      state.groups.push(appended);
      state.paginationControls.add(inspectedGroup.evidenceMore);
      registeredReportPaginationControls.set(
        inspectedGroup.evidenceMore,
        Object.freeze({
          source,
          section: inspected.section,
          operation: Object.freeze({ kind: "evidence", groupIndex }),
        }),
      );
      for (
        let evidenceIndex = 0;
        evidenceIndex < inspectedGroup.rows.length;
        evidenceIndex += 1
      ) {
        registerInspectedAction(inspected, source, groupIndex, evidenceIndex);
        appended.rows.push(inspectedGroup.rows[evidenceIndex]!);
        appended.actions.push(inspectedGroup.actions[evidenceIndex]!);
      }
      continue;
    }
    for (
      let evidenceIndex = registeredGroup.rows.length;
      evidenceIndex < inspectedGroup.rows.length;
      evidenceIndex += 1
    ) {
      registerInspectedAction(inspected, source, groupIndex, evidenceIndex);
      registeredGroup.rows.push(inspectedGroup.rows[evidenceIndex]!);
      registeredGroup.actions.push(inspectedGroup.actions[evidenceIndex]!);
    }
  }
}

function matchesEvidencePaginationDelta(
  inspected: InspectedReportSection,
  state: RegisteredReportSectionState,
  groupIndex: number,
): boolean {
  const registeredGroup = state.groups[groupIndex];
  const expectedGroup = inspected.expected.groups[groupIndex];
  if (
    registeredGroup === undefined
    || expectedGroup === undefined
    || inspected.groups.length !== state.groups.length
  ) return false;
  const expectedNextCount = Math.min(
    registeredGroup.rows.length + EVIDENCE_PAGE_SIZE,
    expectedGroup.evidence.length,
  );
  if (expectedNextCount <= registeredGroup.rows.length) return false;
  return inspected.groups.every((group, index) => {
    const prior = state.groups[index];
    if (prior === undefined) return false;
    return group.rows.length === (
      index === groupIndex ? expectedNextCount : prior.rows.length
    );
  });
}

function matchesGroupPaginationDelta(
  inspected: InspectedReportSection,
  state: RegisteredReportSectionState,
): boolean {
  const expectedNextCount = Math.min(
    state.groups.length + GROUP_PAGE_SIZE,
    inspected.expected.groups.length,
  );
  if (
    expectedNextCount <= state.groups.length
    || inspected.groups.length !== expectedNextCount
  ) return false;
  for (let groupIndex = 0; groupIndex < inspected.groups.length; groupIndex += 1) {
    const group = inspected.groups[groupIndex];
    const expectedGroup = inspected.expected.groups[groupIndex];
    if (group === undefined || expectedGroup === undefined) return false;
    const prior = state.groups[groupIndex];
    if (prior !== undefined) {
      if (group.rows.length !== prior.rows.length) return false;
      continue;
    }
    if (
      group.rows.length
        !== Math.min(EVIDENCE_PAGE_SIZE, expectedGroup.evidence.length)
    ) return false;
  }
  return true;
}

function matchesPaginationDelta(
  inspected: InspectedReportSection,
  state: RegisteredReportSectionState,
  operation: ReportPaginationOperation,
): boolean {
  return operation.kind === "evidence"
    ? matchesEvidencePaginationDelta(
      inspected,
      state,
      operation.groupIndex,
    )
    : matchesGroupPaginationDelta(inspected, state);
}

/**
 * Captures original report contributor nodes after one controlled app render.
 * A later activation may extend these prefixes, but cannot replace them.
 */
export function captureVisibleGovernedReportReviewActions(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const states = new Map<
    RegisteredReportSource,
    RegisteredReportSectionState | null
  >();
  registeredReportSections.set(root, states);
  for (const source of REGISTERED_REPORT_SOURCES) {
    const inspected = inspectReportSection(root, snapshot, source);
    states.set(
      source,
      inspected === null
        ? null
        : createRegisteredSectionState(inspected, source),
    );
  }
}

function extendVisibleSource(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  source: RegisteredReportSource,
  operation: ReportPaginationOperation,
): void {
  const state = registeredReportSections.get(root)?.get(source);
  if (state === undefined || state === null || state.poisoned) return;
  if (!hasRegisteredStructuralPrefix(root, source, state)) {
    state.liveValid = false;
    state.poisoned = true;
    return;
  }
  const inspected = inspectReportSection(root, snapshot, source);
  if (inspected === null) {
    state.liveValid = false;
    return;
  }
  if (!matchesPaginationDelta(inspected, state, operation)) return;
  extendRegisteredSectionState(inspected, source, state);
  state.liveValid = true;
}

/**
 * Extends only after a previously registered app-owned pagination control runs.
 * Evidence activation is validate-only and can never register its own suffix.
 */
export function registerVisibleGovernedReportReviewActions(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  eventTarget: Element,
): void {
  const control = eventTarget.closest<HTMLButtonElement>("button");
  const identity = control === null
    ? undefined
    : registeredReportPaginationControls.get(control);
  const state = identity === undefined
    ? undefined
    : registeredReportSections.get(root)?.get(identity.source);
  if (
    control === null
    || identity === undefined
    || state === undefined
    || state === null
    || identity.section !== state.section
    || !state.paginationControls.has(control)
    || !state.section.contains(control)
    || !root.contains(control)
  ) return;
  extendVisibleSource(root, snapshot, identity.source, identity.operation);
}

const GOVERNED_REPORT_ORIGIN_SELECTOR = REGISTERED_REPORT_SOURCES
  .flatMap((source) => {
    const dom = REPORT_DOM_CONTRACTS[source];
    return [
      dom.sectionSelector,
      dom.groupSelector,
      dom.evidenceListSelector,
      dom.evidenceSelector,
    ];
  })
  .join(", ");

export function isGovernedReportReviewOrigin(
  trigger: HTMLButtonElement,
): boolean {
  return registeredReportActionIdentities.has(trigger)
    || trigger.closest(GOVERNED_REPORT_ORIGIN_SELECTOR) !== null;
}

/** Revalidates one captured contributor against live DOM and current report output. */
export function matchesRegisteredGovernedReportReviewAction(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  trigger: HTMLButtonElement,
  source: RegisteredReportSource,
  tradeSubjectId: string,
): boolean {
  const identity = registeredReportActionIdentities.get(trigger);
  const state = registeredReportSections.get(root)?.get(source);
  const expected = expectedReportIdentity(snapshot, source);
  if (
    identity === undefined
    || state === undefined
    || state === null
    || state.poisoned
    || !state.liveValid
    || expected === null
    || identity.source !== source
    || identity.tradeSubjectId !== tradeSubjectId
    || trigger.dataset.tradeReviewReportSource !== source
    || trigger.dataset.reviewTrade !== tradeSubjectId
    || state.section !== identity.section
    || !root.contains(trigger)
  ) return false;

  const registeredGroup = state.groups[identity.groupIndex];
  const expectedGroup = expected.groups[identity.groupIndex];
  const expectedEvidence = expectedGroup?.evidence[identity.evidenceIndex];
  if (
    registeredGroup === undefined
    || expectedGroup === undefined
    || expectedEvidence === undefined
    || registeredGroup.group !== identity.group
    || registeredGroup.evidenceList !== identity.evidenceList
    || registeredGroup.rows[identity.evidenceIndex] !== identity.evidenceRow
    || registeredGroup.actions[identity.evidenceIndex] !== trigger
    || identity.groupDomIdentity !== expectedGroup.domIdentity
    || identity.evidenceListDomIdentity !== expectedGroup.evidenceListDomIdentity
    || identity.evidenceDomIdentity !== expectedEvidence.domIdentity
    || expectedEvidence.tradeSubjectId !== tradeSubjectId
  ) return false;

  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    expected.dom.sectionSelector,
  ));
  const groups = Array.from(identity.section.querySelectorAll<HTMLElement>(
    expected.dom.groupSelector,
  ));
  const lists = Array.from(identity.group.querySelectorAll<HTMLElement>(
    expected.dom.evidenceListSelector,
  ));
  const rows = Array.from(identity.evidenceList.querySelectorAll<HTMLElement>(
    expected.dom.evidenceSelector,
  ));
  const groupRows = Array.from(identity.group.querySelectorAll<HTMLElement>(
    expected.dom.evidenceSelector,
  ));
  const rowActions = Array.from(
    identity.evidenceRow.querySelectorAll<HTMLButtonElement>(
      "button.report-trade-action",
    ),
  );
  if (
    sections.length !== 1
    || sections[0] !== identity.section
    || groups.length !== state.groups.length
    || groups[identity.groupIndex] !== identity.group
    || lists.length !== 1
    || lists[0] !== identity.evidenceList
    || rows.length !== registeredGroup.rows.length
    || !sameElements(rows, groupRows)
    || rows[identity.evidenceIndex] !== identity.evidenceRow
    || rowActions.length !== 1
    || rowActions[0] !== trigger
    || expected.dom.groupDomIdentity(identity.group) !== identity.groupDomIdentity
    || expected.dom.evidenceListDomIdentity(identity.evidenceList)
      !== identity.evidenceListDomIdentity
    || expected.dom.evidenceDomIdentity(identity.evidenceRow)
      !== identity.evidenceDomIdentity
  ) return false;

  const sectionActions = Array.from(
    identity.section.querySelectorAll<HTMLButtonElement>(
      "button.report-trade-action",
    ),
  );
  const registeredActionCount = state.groups.reduce(
    (count, group) => count + group.actions.length,
    0,
  );
  return sectionActions.length === registeredActionCount
    && sectionActions.every((action) => {
      const registered = registeredReportActionIdentities.get(action);
      return registered !== undefined
        && registered.source === source
        && registered.section === identity.section;
    });
}
