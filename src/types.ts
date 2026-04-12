export type SpecialistRole = 'researcher' | 'architect' | 'critic' | 'pragmatist' | 'dreamer' | 'synthesizer' | 'custom';

export interface SpreadConfig {
  idea: string;
  specialists: SpecialistRole[];
  rounds: number;
  crossPollinate: boolean;
  contextFiles: string[];
}

export interface SpecialistResult {
  role: SpecialistRole;
  round: number;
  content: string;
  confidence: number;
  keyInsights: string[];
  concerns: string[];
}

export interface SpreadResult {
  idea: string;
  seed: string;
  results: SpecialistResult[];
  synthesis: string;
  consensusPoints: string[];
  disagreements: string[];
  actionItems: string[];
  totalTokens: number;
  startedAt: string;
  completedAt: string;
}
