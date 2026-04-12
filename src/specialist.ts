import type { SpecialistRole, SpecialistResult } from './types.js';

const ROLE_PROFILES: Record<SpecialistRole, { perspective: string; focus: string; insights: string[]; concerns: string[]; baseConf: number }> = {
  researcher: { perspective: 'evidence-based', focus: 'what is already known', insights: ['pattern-match with existing solutions', 'state management is critical'], concerns: ['may over-index on precedent'], baseConf: 0.8 },
  architect: { perspective: 'structural', focus: 'system design and interfaces', insights: ['clear interface boundaries', 'layered decomposition'], concerns: ['over-abstraction risk'], baseConf: 0.75 },
  critic: { perspective: 'skeptical', focus: 'what could go wrong', insights: ['identified 3 failure modes', 'weakest assumption flagged'], concerns: ['scope creep', 'edge cases'], baseConf: 0.6 },
  pragmatist: { perspective: 'practical', focus: 'MVP path', insights: ['MVP path identified', 'resource estimate provided'], concerns: ['may under-invest in foundations'], baseConf: 0.7 },
  dreamer: { perspective: 'creative', focus: 'what if anything were possible', insights: ['novel angle on self-evolution', 'long-term vision'], concerns: ['may not be practical yet'], baseConf: 0.5 },
  synthesizer: { perspective: 'integrative', focus: 'common threads', insights: ['consensus points identified', 'tension acknowledged'], concerns: ['may paper over real disagreements'], baseConf: 0.65 },
  custom: { perspective: 'general purpose', focus: 'any relevant angle', insights: ['multiple valid approaches'], concerns: ['context-dependent'], baseConf: 0.6 },
};

export function generateSpecialistResponse(
  role: SpecialistRole, idea: string, round: number, previousResults: SpecialistResult[],
): SpecialistResult {
  const profile = ROLE_PROFILES[role];
  const prevCtx = previousResults.length > 0
    ? ' Other perspectives: ' + previousResults.map(r => r.role + ': ' + r.content.slice(0, 80)).join('; ')
    : '';
  const content = 'From a ' + profile.perspective + ' perspective, examining "' + idea + '" with focus on ' + profile.focus + '.' + prevCtx + ' Round ' + (round + 1) + ' analysis.';
  return {
    role, round, content,
    keyInsights: profile.insights,
    concerns: profile.concerns,
    confidence: Math.min(1.0, profile.baseConf + round * 0.05),
  };
}

export function synthesizeResults(results: SpecialistResult[]): {
  synthesis: string; consensusPoints: string[]; disagreements: string[]; actionItems: string[];
} {
  const allInsights = results.flatMap(r => r.keyInsights);
  const allConcerns = results.flatMap(r => r.concerns);
  const counts = new Map<string, number>();
  for (const i of allInsights) counts.set(i, (counts.get(i) || 0) + 1);
  const consensusPoints = [...counts.entries()].filter(([, c]) => c >= 2).map(([k]) => k);
  const concernCounts = new Map<string, number>();
  for (const c of allConcerns) concernCounts.set(c, (concernCounts.get(c) || 0) + 1);
  const disagreements = [...concernCounts.entries()].filter(([, c]) => c === 1).map(([k]) => k);
  const actionItems = ['Validate consensus with stakeholders', 'Address unique concerns', 'Prototype MVP path', 'Document long-term vision'];
  const synthesis = 'Spread complete. ' + results.length + ' specialists. ' + consensusPoints.length + ' consensus points, ' + disagreements.length + ' unique concerns. Recommended: prototype thin slice, gather feedback.';
  return { synthesis, consensusPoints, disagreements, actionItems };
}
