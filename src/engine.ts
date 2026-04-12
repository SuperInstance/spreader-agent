import type { SpreadConfig, SpecialistResult, SpreadResult } from './types.js';
import { generateSpecialistResponse, synthesizeResults } from './specialist.js';

export class SpreadEngine {
  private config: SpreadConfig;
  private results: SpecialistResult[] = [];

  constructor(config: SpreadConfig) { this.config = config; }

  async run(): Promise<SpreadResult> {
    const startedAt = new Date().toISOString();
    this.results = [];
    for (let round = 0; round < this.config.rounds; round++) {
      for (const specialist of this.config.specialists) {
        const prev = this.config.crossPollinate ? this.results : this.results.filter(r => r.role === specialist);
        this.results.push(generateSpecialistResponse(specialist, this.config.idea, round, prev));
      }
    }
    const { synthesis, consensusPoints, disagreements, actionItems } = synthesizeResults(this.results);
    return { idea: this.config.idea, seed: this.config.idea, results: this.results, synthesis, consensusPoints, disagreements, actionItems, totalTokens: this.results.length * 200, startedAt, completedAt: new Date().toISOString() };
  }

  getResults(): SpecialistResult[] { return [...this.results]; }
}
