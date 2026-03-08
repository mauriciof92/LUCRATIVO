export type StrategyType =
  | "bingoSeguro"
  | "bingoAlavanc"
  | "sinfonia"
  | "ftbox";

export type RiskLevel = "low" | "medium" | "high";

export type OddsSource =
  | "api-real"
  | "csv"
  | "estimated"
  | "csv-rejected"
  | "estimated-rejected"
  | "unavailable";

export type OddsQuality = "real" | "csv" | "estimated" | "rejected" | "none";

export type MarketPeriod = "HT" | "FT";
export type MarketScope = "match" | "home" | "away" | "unknown";

export type BetResultStatus =
  | "win"
  | "lose"
  | "push"
  | "avg"
  | "no-odd"
  | "pending_manual";

export interface ScoreResult {
  score: number; // 0..1
  label?: string;
  reasons?: string[];
}

export interface ConfidenceResult {
  score: number; // 0..1
  label?: string;
  reasons?: string[];
}

export interface OddsResolution {
  marketOdd: number | null;
  minOdd: number;
  source: OddsSource;
  quality: OddsQuality;
  isTradable: boolean;
  estimatedOdd?: number | null;
  marketKey?: string;
  provider?: string;
  capturedAt?: string;
}

export interface ValueBetResult {
  edge: number; // em %
  hasValue: boolean;
  recommendation: "Forte valor" | "Valor" | "Neutro" | "Sem valor";
  fairOdd?: number | null;
  expectedValue?: number | null;
}

export interface GameIdentity {
  fixtureId?: number | null;
  match: string;
  league?: string;
  hour?: string;
  home?: string;
  away?: string;
  kickoffAt?: string;
  status?: string;
}

export interface GameMetrics {
  score: number; // 0..1
  confidence: number; // 0..1
  profile?: string;
  features?: Record<string, unknown>;
}

export interface Game extends GameIdentity, GameMetrics {
  raw?: unknown;
}

export interface MarketDescriptor {
  label: string;
  type?: string;
  period?: MarketPeriod;
  scope?: MarketScope;
  line?: number | null;
}

export interface SelectionCandidate {
  gameId?: string;
  match: string;
  league: string;
  hour: string;
  market: string;
  marketMeta?: MarketDescriptor;

  odd: number | null;
  minOdd: number;
  oddSource: OddsSource;
  oddQuality: OddsQuality;
  isTradable: boolean;

  hasValue: boolean;
  edge: number;
  recommendation: string;

  gameProfile: string;
  selectionConfidence: number; // 0..100
  score?: number; // opcional, para ranking
  reason?: string;
  oddTag?: string;
}

export interface DomainSuggestion {
  id: string;
  strategy: StrategyType;
  suggestionConfidence: number; // 0..100
  expectedValue: number; // decimal, ex: 0.08 = 8%
  riskLevel: RiskLevel;
  selections: SelectionCandidate[];
  combinedOdd: number;
  suggestedStake: number;
  expectedReturn: number;
}

export interface AnalyzerSummary {
  totalGames: number;
  qualityGames: number;
  confluencePairs: number;
  avgConfidence: number;
}

export interface StrategyDiagnostics {
  discardedGames?: Array<{
    match: string;
    reason: string;
  }>;
  notes?: string[];
}

export interface StrategyResult {
  strategy: StrategyType;
  suggestion: DomainSuggestion | null;
  diagnostics?: StrategyDiagnostics;
}

export interface LiveMultipleSuggestionDTO {
  id: string;
  type: StrategyType;
  confidence: number;
  expectedValue: number;
  riskLevel: RiskLevel;
  selections: Array<{
    match: string;
    league: string;
    hour: string;
    market: string;
    odd: number;
    minOdd: number;
    hasValue: boolean;
    edge: number;
    recommendation: string;
    reason: string;
    gameProfile: string;
    confidence: number;
    oddTag?: string;
  }>;
  combinedOdd: number;
  suggestedStake: number;
  expectedReturn: number;
  riskReward: string;
}

export interface SuggestionViewModel extends LiveMultipleSuggestionDTO {
  displayType?: string;
  badgeColor?: string;
}

export function toOddsQuality(source: OddsSource): OddsQuality {
  switch (source) {
    case "api-real":
      return "real";
    case "csv":
      return "csv";
    case "estimated":
      return "estimated";
    case "csv-rejected":
    case "estimated-rejected":
      return "rejected";
    default:
      return "none";
  }
}

export function toRiskRewardLabel(combinedOdd: number): string {
  if (combinedOdd <= 25) return "Excelente";
  if (combinedOdd <= 30) return "Bom";
  return "Moderado";
}

export function toLiveMultipleSuggestionDTO(
  suggestion: DomainSuggestion
): LiveMultipleSuggestionDTO {
  return {
    id: suggestion.id,
    type: suggestion.strategy,
    confidence: suggestion.suggestionConfidence,
    expectedValue: suggestion.expectedValue,
    riskLevel: suggestion.riskLevel,
    selections: suggestion.selections.map((s) => ({
      match: s.match,
      league: s.league,
      hour: s.hour,
      market: s.market,
      odd: s.odd ?? s.minOdd,
      minOdd: s.minOdd,
      hasValue: s.hasValue,
      edge: s.edge,
      recommendation: s.recommendation,
      reason: s.reason ?? "",
      gameProfile: s.gameProfile,
      confidence: s.selectionConfidence,
      oddTag: s.oddTag,
    })),
    combinedOdd: suggestion.combinedOdd,
    suggestedStake: suggestion.suggestedStake,
    expectedReturn: suggestion.expectedReturn,
    riskReward: toRiskRewardLabel(suggestion.combinedOdd),
  };
}

export interface FtBoxCandidate {
  match: string;
  league?: string;
  hour?: string;
  market?: string;
  odd?: number | null;
  confidence?: number;
  edge?: number;
  reason?: string;
}

export interface AnalyzerGameView {
  match: string;
  league?: string;
  hour?: string;
  status?: string;
  score: number;
  confidence: number;
  profile?: string;
}

export interface AnalyzerResult {
  suggestions: LiveMultipleSuggestionDTO[];
  summary: AnalyzerSummary;
  ftBoxCandidates?: FtBoxCandidate[];
  games?: AnalyzerGameView[];
}
