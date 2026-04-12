import * as fs from 'fs';
import * as path from 'path';
import type { SpreadResult } from './types.js';

export function writeSpreadOutput(result: SpreadResult, outputDir: string): string[] {
  fs.mkdirSync(outputDir, { recursive: true });
  const files: string[] = [];
  const seedPath = path.join(outputDir, '001-seed.md');
  fs.writeFileSync(seedPath, '# Seed Idea\n\n' + result.idea + '\n');
  files.push(seedPath);
  result.results.forEach((r, i) => {
    const fp = path.join(outputDir, String(i + 2).padStart(3, '0') + '-' + r.role + '.md');
    fs.writeFileSync(fp, '# ' + r.role.charAt(0).toUpperCase() + r.role.slice(1) + ' (Round ' + (r.round + 1) + ')\n\n' + r.content + '\n');
    files.push(fp);
  });
  const synthPath = path.join(outputDir, String(result.results.length + 2).padStart(3, '0') + '-synthesis.md');
  fs.writeFileSync(synthPath, '# Synthesis\n\n' + result.synthesis + '\n');
  files.push(synthPath);
  const jsonPath = path.join(outputDir, 'spread.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  files.push(jsonPath);
  return files;
}
