import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { generateSpecialistResponse, synthesizeResults } from '../src/specialist';
import { SpreadEngine } from '../src/engine';
import { writeSpreadOutput } from '../src/output';
import type { SpreadConfig, SpecialistResult, SpecialistRole } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ===================================================================
// Specialist Response Generation
// ===================================================================

describe('Specialist', () => {
  it('generates response for each role', () => {
    for (const role of ['researcher', 'architect', 'critic', 'pragmatist', 'dreamer', 'synthesizer', 'custom'] as SpecialistRole[]) {
      const r = generateSpecialistResponse(role, 'test', 0, []);
      expect(r.role).toBe(role);
      expect(r.content.length).toBeGreaterThan(10);
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.keyInsights.length).toBeGreaterThan(0);
    }
  });

  it('incorporates previous results', () => {
    const prev: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'Previous finding', confidence: 0.8, keyInsights: ['x'], concerns: ['y'] },
    ];
    const r = generateSpecialistResponse('architect', 'build', 1, prev);
    expect(r.round).toBe(1);
    expect(r.content).toContain('Previous finding');
  });

  it('confidence increases with rounds', () => {
    const r0 = generateSpecialistResponse('researcher', 'test', 0, []);
    const r5 = generateSpecialistResponse('researcher', 'test', 5, []);
    expect(r5.confidence).toBeGreaterThanOrEqual(r0.confidence);
  });

  it('confidence is capped at 1.0', () => {
    const r = generateSpecialistResponse('researcher', 'test', 100, []);
    expect(r.confidence).toBeLessThanOrEqual(1.0);
  });

  it('researcher has evidence-based perspective', () => {
    const r = generateSpecialistResponse('researcher', 'test', 0, []);
    expect(r.content).toContain('evidence-based');
  });

  it('architect has structural perspective', () => {
    const r = generateSpecialistResponse('architect', 'test', 0, []);
    expect(r.content).toContain('structural');
  });

  it('critic has skeptical perspective', () => {
    const r = generateSpecialistResponse('critic', 'test', 0, []);
    expect(r.content).toContain('skeptical');
  });

  it('pragmatist has practical perspective', () => {
    const r = generateSpecialistResponse('pragmatist', 'test', 0, []);
    expect(r.content).toContain('practical');
  });

  it('dreamer has creative perspective', () => {
    const r = generateSpecialistResponse('dreamer', 'test', 0, []);
    expect(r.content).toContain('creative');
  });

  it('synthesizer has integrative perspective', () => {
    const r = generateSpecialistResponse('synthesizer', 'test', 0, []);
    expect(r.content).toContain('integrative');
  });

  it('custom role has general purpose perspective', () => {
    const r = generateSpecialistResponse('custom', 'test', 0, []);
    expect(r.content).toContain('general purpose');
  });

  it('content includes the idea', () => {
    const r = generateSpecialistResponse('researcher', 'my unique idea XYZ', 0, []);
    expect(r.content).toContain('my unique idea XYZ');
  });

  it('content includes round number', () => {
    const r = generateSpecialistResponse('researcher', 'test', 3, []);
    expect(r.content).toContain('Round 4'); // round+1
  });

  it('keyInsights are from profile', () => {
    const r = generateSpecialistResponse('researcher', 'test', 0, []);
    expect(r.keyInsights).toContain('pattern-match with existing solutions');
  });

  it('concerns are from profile', () => {
    const r = generateSpecialistResponse('critic', 'test', 0, []);
    expect(r.concerns).toContain('scope creep');
  });

  it('handles multiple previous results', () => {
    const prev: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'Finding A', confidence: 0.8, keyInsights: ['a'], concerns: [] },
      { role: 'architect', round: 0, content: 'Finding B', confidence: 0.7, keyInsights: ['b'], concerns: [] },
    ];
    const r = generateSpecialistResponse('critic', 'test', 1, prev);
    expect(r.content).toContain('Finding A');
    expect(r.content).toContain('Finding B');
  });

  it('handles empty previous results gracefully', () => {
    const r = generateSpecialistResponse('researcher', 'test', 0, []);
    expect(r.content).not.toContain('Other perspectives');
  });

  it('round number appears in output for round 0', () => {
    const r = generateSpecialistResponse('pragmatist', 'idea', 0, []);
    expect(r.round).toBe(0);
    expect(r.content).toContain('Round 1');
  });
});

// ===================================================================
// Synthesis
// ===================================================================

describe('Synthesis', () => {
  it('synthesizes multiple results', () => {
    const results: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: ['shared insight'], concerns: ['unique-a'] },
      { role: 'architect', round: 0, content: 'B', confidence: 0.75, keyInsights: ['shared insight'], concerns: ['unique-b'] },
    ];
    const s = synthesizeResults(results);
    expect(s.synthesis.length).toBeGreaterThan(0);
    expect(s.consensusPoints).toContain('shared insight');
    expect(s.actionItems.length).toBeGreaterThan(0);
  });

  it('finds disagreements', () => {
    const s = synthesizeResults([
      { role: 'researcher', round: 0, content: 'A', confidence: 0.7, keyInsights: ['x'], concerns: ['unique-1'] },
      { role: 'critic', round: 0, content: 'B', confidence: 0.5, keyInsights: ['y'], concerns: ['unique-2'] },
    ]);
    expect(s.disagreements.length).toBe(2);
  });

  it('handles empty results', () => {
    const s = synthesizeResults([]);
    expect(s.consensusPoints).toEqual([]);
    expect(s.disagreements).toEqual([]);
    expect(s.actionItems.length).toBeGreaterThan(0);
  });

  it('synthesis text includes specialist count', () => {
    const results: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: [], concerns: [] },
      { role: 'architect', round: 0, content: 'B', confidence: 0.75, keyInsights: [], concerns: [] },
      { role: 'critic', round: 0, content: 'C', confidence: 0.6, keyInsights: [], concerns: [] },
    ];
    const s = synthesizeResults(results);
    expect(s.synthesis).toContain('3 specialists');
  });

  it('action items are always returned', () => {
    const s = synthesizeResults([]);
    expect(s.actionItems).toContain('Validate consensus with stakeholders');
    expect(s.actionItems).toContain('Prototype MVP path');
    expect(s.actionItems).toContain('Document long-term vision');
  });

  it('no consensus when all insights unique', () => {
    const results: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: ['a'], concerns: [] },
      { role: 'critic', round: 0, content: 'B', confidence: 0.5, keyInsights: ['b'], concerns: [] },
    ];
    const s = synthesizeResults(results);
    expect(s.consensusPoints.length).toBe(0);
  });

  it('consensus requires 2+ occurrences', () => {
    const results: SpecialistResult[] = [
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: ['shared'], concerns: [] },
      { role: 'architect', round: 0, content: 'B', confidence: 0.75, keyInsights: ['shared'], concerns: [] },
      { role: 'critic', round: 0, content: 'C', confidence: 0.6, keyInsights: ['unique'], concerns: [] },
    ];
    const s = synthesizeResults(results);
    expect(s.consensusPoints).toEqual(['shared']);
  });

  it('handles single result', () => {
    const s = synthesizeResults([
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: ['solo'], concerns: ['lonely'] },
    ]);
    expect(s.consensusPoints).toEqual([]);
    expect(s.disagreements).toEqual(['lonely']);
  });

  it('returns all four fields', () => {
    const s = synthesizeResults([
      { role: 'researcher', round: 0, content: 'A', confidence: 0.8, keyInsights: [], concerns: [] },
    ]);
    expect(s).toHaveProperty('synthesis');
    expect(s).toHaveProperty('consensusPoints');
    expect(s).toHaveProperty('disagreements');
    expect(s).toHaveProperty('actionItems');
  });
});

// ===================================================================
// SpreadEngine
// ===================================================================

describe('SpreadEngine', () => {
  it('runs a basic spread', async () => {
    const e = new SpreadEngine({ idea: 'event sourcing?', specialists: ['researcher', 'critic'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.results.length).toBe(2);
    expect(r.synthesis.length).toBeGreaterThan(0);
  });

  it('runs multiple rounds', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher', 'architect'], rounds: 3, crossPollinate: true, contextFiles: [] });
    const r = await e.run();
    expect(r.results.length).toBe(6);
  });

  it('tracks tokens', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.totalTokens).toBeGreaterThan(0);
  });

  it('returns the seed idea', async () => {
    const e = new SpreadEngine({ idea: 'unique seed 123', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.idea).toBe('unique seed 123');
    expect(r.seed).toBe('unique seed 123');
  });

  it('has startedAt and completedAt timestamps', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.startedAt).toBeTruthy();
    expect(r.completedAt).toBeTruthy();
    expect(new Date(r.startedAt).getTime()).toBeLessThanOrEqual(new Date(r.completedAt).getTime());
  });

  it('cross-pollination includes other roles', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher', 'architect'], rounds: 2, crossPollinate: true, contextFiles: [] });
    const r = await e.run();
    // Architect in round 1 should have seen researcher's round 0 result
    const architectR1 = r.results.find(res => res.role === 'architect' && res.round === 1);
    expect(architectR1!.content).toContain('evidence-based');
  });

  it('no cross-pollination filters to own role only', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher', 'architect'], rounds: 2, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    // Architect in round 1 should only see previous architect results
    const architectR1 = r.results.find(res => res.role === 'architect' && res.round === 1);
    expect(architectR1!.content).not.toContain('evidence-based');
  });

  it('getResults returns copy', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    await e.run();
    const results = e.getResults();
    expect(results.length).toBe(1);
    results.push({ role: 'custom', round: 0, content: '', confidence: 0, keyInsights: [], concerns: [] });
    expect(e.getResults().length).toBe(1); // Original unchanged
  });

  it('getResults empty before run', () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    expect(e.getResults()).toEqual([]);
  });

  it('single specialist single round', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['dreamer'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.results.length).toBe(1);
    expect(r.results[0].role).toBe('dreamer');
  });

  it('all seven specialist roles', async () => {
    const roles: SpecialistRole[] = ['researcher', 'architect', 'critic', 'pragmatist', 'dreamer', 'synthesizer', 'custom'];
    const e = new SpreadEngine({ idea: 'test', specialists: roles, rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.results.length).toBe(7);
    const resultRoles = r.results.map(res => res.role);
    for (const role of roles) {
      expect(resultRoles).toContain(role);
    }
  });

  it('zero rounds produces no results', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 0, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.results.length).toBe(0);
  });

  it('token count scales with results', async () => {
    const e1 = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r1 = await e1.run();
    const e2 = new SpreadEngine({ idea: 'test', specialists: ['researcher', 'architect'], rounds: 2, crossPollinate: false, contextFiles: [] });
    const r2 = await e2.run();
    expect(r2.totalTokens).toBeGreaterThan(r1.totalTokens);
  });
});

// ===================================================================
// Output
// ===================================================================

describe('Output', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), 'spreader-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('writes output files', async () => {
    const e = new SpreadEngine({ idea: 'test idea', specialists: ['researcher', 'critic'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    const files = writeSpreadOutput(r, tmpDir);
    expect(files.length).toBe(5); // seed + 2 specialists + synthesis + json
    for (const f of files) expect(fs.existsSync(f)).toBe(true);
  });

  it('writes valid JSON', async () => {
    const e = new SpreadEngine({ idea: 'json test', specialists: ['dreamer'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    writeSpreadOutput(r, tmpDir);
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'spread.json'), 'utf-8'));
    expect(parsed.idea).toBe('json test');
  });

  it('writes seed file first', async () => {
    const e = new SpreadEngine({ idea: 'seed content', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    const files = writeSpreadOutput(r, tmpDir);
    const seedFile = files.find(f => f.endsWith('001-seed.md'));
    expect(seedFile).toBeTruthy();
    const content = fs.readFileSync(seedFile!, 'utf-8');
    expect(content).toContain('seed content');
    expect(content).toContain('# Seed Idea');
  });

  it('writes specialist files with correct names', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher', 'architect'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    writeSpreadOutput(r, tmpDir);
    const files = fs.readdirSync(tmpDir);
    expect(files.some(f => f.includes('researcher'))).toBe(true);
    expect(files.some(f => f.includes('architect'))).toBe(true);
  });

  it('writes synthesis file', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    writeSpreadOutput(r, tmpDir);
    const synthFile = fs.readdirSync(tmpDir).find(f => f.includes('synthesis'));
    expect(synthFile).toBeTruthy();
    const content = fs.readFileSync(path.join(tmpDir, synthFile!), 'utf-8');
    expect(content).toContain('# Synthesis');
    expect(content).toContain(r.synthesis);
  });

  it('creates output directory if not exists', async () => {
    const deepDir = path.join(tmpDir, 'deep', 'nested', 'dir');
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    const files = writeSpreadOutput(r, deepDir);
    expect(files.length).toBeGreaterThan(0);
    expect(fs.existsSync(deepDir)).toBe(true);
  });

  it('JSON contains all result fields', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    writeSpreadOutput(r, tmpDir);
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'spread.json'), 'utf-8'));
    expect(parsed).toHaveProperty('idea');
    expect(parsed).toHaveProperty('results');
    expect(parsed).toHaveProperty('synthesis');
    expect(parsed).toHaveProperty('consensusPoints');
    expect(parsed).toHaveProperty('disagreements');
    expect(parsed).toHaveProperty('actionItems');
    expect(parsed).toHaveProperty('totalTokens');
    expect(parsed).toHaveProperty('startedAt');
    expect(parsed).toHaveProperty('completedAt');
  });

  it('returns list of written file paths', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    const files = writeSpreadOutput(r, tmpDir);
    expect(Array.isArray(files)).toBe(true);
    for (const f of files) {
      expect(typeof f).toBe('string');
      expect(f).toContain(tmpDir);
    }
  });
});

// ===================================================================
// SpreadConfig Types
// ===================================================================

describe('Types', () => {
  it('SpecialistRole type validation', () => {
    const validRoles: SpecialistRole[] = ['researcher', 'architect', 'critic', 'pragmatist', 'dreamer', 'synthesizer', 'custom'];
    expect(validRoles).toHaveLength(7);
  });

  it('SpreadConfig can be constructed', () => {
    const config: SpreadConfig = {
      idea: 'test',
      specialists: ['researcher'],
      rounds: 1,
      crossPollinate: false,
      contextFiles: [],
    };
    expect(config.idea).toBe('test');
    expect(config.rounds).toBe(1);
    expect(config.crossPollinate).toBe(false);
    expect(config.contextFiles).toEqual([]);
  });

  it('SpecialistResult can be constructed', () => {
    const result: SpecialistResult = {
      role: 'researcher',
      round: 0,
      content: 'test content',
      confidence: 0.8,
      keyInsights: ['insight'],
      concerns: ['concern'],
    };
    expect(result.role).toBe('researcher');
    expect(result.confidence).toBe(0.8);
  });

  it('SpreadResult has all required fields', async () => {
    const e = new SpreadEngine({ idea: 'test', specialists: ['researcher'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    expect(r.idea).toBeTruthy();
    expect(r.seed).toBeTruthy();
    expect(Array.isArray(r.results)).toBe(true);
    expect(typeof r.synthesis).toBe('string');
    expect(Array.isArray(r.consensusPoints)).toBe(true);
    expect(Array.isArray(r.disagreements)).toBe(true);
    expect(Array.isArray(r.actionItems)).toBe(true);
    expect(typeof r.totalTokens).toBe('number');
    expect(typeof r.startedAt).toBe('string');
    expect(typeof r.completedAt).toBe('string');
  });
});
