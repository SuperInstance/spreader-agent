import { describe, it, expect, afterEach } from 'vitest';
import { generateSpecialistResponse, synthesizeResults } from '../src/specialist';
import { SpreadEngine } from '../src/engine';
import { writeSpreadOutput } from '../src/output';
import type { SpreadConfig, SpecialistResult, SpecialistRole } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Specialist', () => {
  it('generates response for each role', () => {
    for (const role of ['researcher', 'architect', 'critic', 'pragmatist', 'dreamer', 'synthesizer'] as SpecialistRole[]) {
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
});

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
  });
});

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
});

describe('Output', () => {
  const tmpDir = path.join(os.tmpdir(), 'spreader-test-' + Date.now());
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} });

  it('writes output files', async () => {
    const e = new SpreadEngine({ idea: 'test idea', specialists: ['researcher', 'critic'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    const files = writeSpreadOutput(r, tmpDir);
    expect(files.length).toBe(5);
    for (const f of files) expect(fs.existsSync(f)).toBe(true);
  });

  it('writes valid JSON', async () => {
    const e = new SpreadEngine({ idea: 'json test', specialists: ['dreamer'], rounds: 1, crossPollinate: false, contextFiles: [] });
    const r = await e.run();
    writeSpreadOutput(r, tmpDir);
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'spread.json'), 'utf-8'));
    expect(parsed.idea).toBe('json test');
  });
});
