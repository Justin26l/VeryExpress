# Contributing to VeryExpress

Thanks for interest in contributing.

## Report issues
- Open an issue with reproducible steps, environment, and expected vs actual behavior.

## Development setup
```
git clone <repo>
cd VeryExpress
npm i 
npm run dev
```

## Workflow
- Fork repository
- Create branch `feature/<name>` or `fix/<ticket>`
- Run linter, tests and build before PR:
```
npm run lint
npm test
npm run build
```
- Submit PR with clear description and tests (if applicable).

## Code style
- TypeScript: prefer explicit types, avoid `any` where possible.
- Split large functions into small chunks.
- Keep static templates in `src/templates/`, generators in `src/generators/`, types in `src/types`.
- Never hand-edit generated `*.gen.ts` files — see [AGENTS.md](../AGENTS.md).
## JSON Schema contributions
- Working schemas live in `vex.config.json → jsonSchemaDir` (this repo: `output/jsonSchema`).
- Sample schemas are re-copied from `src/templates/jsonSchema/` on every generation run — edit them there to make a schema stick.
- `x-documentConfig.documentName` must match filename (see docs/vexJsonSchema.md).

## PR checklist
- Lint passes
- Tests pass (`npm test`)
- Build succeeds
- Relevant docs updated
- If generated output changed intentionally, goldens regenerated with `npm run test:update` and the diff reviewed
- output app can run
