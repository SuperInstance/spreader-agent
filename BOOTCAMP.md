# Spreader Agent — Bootcamp

## Quick Start

```bash
git clone https://github.com/SuperInstance/spreader-agent.git .spreader
cd .spreader && npm install

# Basic spread
npm run spread -- --idea "What would a self-healing database look like?"

# With project context
npm run spread -- --idea "Should we migrate to microservices?" --context ../src

# Specific angles
npm run spread -- --idea "Design our API" --angles "developer-experience,performance,security,cost"
```

## How It Works

1. **Receive idea** — the seed thought
2. **Fan out** — spawn specialist perspectives (researcher, architect, critic, pragmatist, dreamer)
3. **Cross-pollinate** — each specialist sees the others' output
4. **Synthesize** — combine into actionable insights
5. **Deliver** — markdown files, one per perspective + a synthesis

## Output Structure

```
spread-output/
├── 001-seed.md              # Your original idea, refined
├── 002-researcher.md        # What does the literature say?
├── 003-architect.md         # How would we build it?
├── 004-critic.md            # What could go wrong?
├── 005-pragmatist.md        # What's the MVP path?
├── 006-dreamer.md           # What if we went wild?
├── 007-synthesis.md         # Bringing it all together
└── spread.json              # Machine-readable result
```

## Provider Config

```yaml
provider: openai  # anthropic, ollama, custom
apiKey: ${OPENAI_API_KEY}
model: gpt-4o-mini

specialists:
  - researcher
  - architect
  - critic
  - pragmatist
  - dreamer

crossPollinate: true   # specialists see each other's work
rounds: 1              # how many refinement rounds
```
