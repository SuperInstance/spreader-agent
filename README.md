# spreader-agent
A TypeScript agent for spreading and managing instances.

## What it does
Automates deployment, monitoring, and scaling of instances across environments as part of the **Cocapn Fleet** (SuperInstance org).

## Installation
```bash
git clone https://github.com/SuperInstance/spreader-agent.git
cd spreader-agent
npm ci
```

## Usage
1. Configure settings in `src/config.ts` or via environment variables.  
2. Run the agent:
```bash
npm run start
```
3. Run the test suite:
```bash
npm test
```

## Scripts
- `npm run build` – compile TypeScript.  
- `npm run lint` – lint source files.  

## Documentation
- [BOOTCAMP.md](BOOTCAMP.md) – onboarding guide.  
- [CHARTER.md](CHARTER.md) – project charter.  
- [DOCKSIDE-EXAM.md](DOCKSIDE-EXAM.md) – exam documentation.  

## License
See [LICENSE](LICENSE) for details.