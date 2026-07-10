import type { RiskSnapshot } from "./types";

export interface RiskPresentation {
  readonly label: string;
  readonly contentInert: boolean;
  readonly liveMode: "polite" | "assertive";
}

export function deriveRiskPresentation(risk: RiskSnapshot): RiskPresentation {
  if (risk.level === "breach") {
    return {
      label: "Risk breach",
      contentInert: true,
      liveMode: "assertive",
    };
  }
  if (risk.level === "warn") {
    return {
      label: "Risk warning",
      contentInert: false,
      liveMode: "polite",
    };
  }
  return {
    label: "Risk clear",
    contentInert: false,
    liveMode: "polite",
  };
}
