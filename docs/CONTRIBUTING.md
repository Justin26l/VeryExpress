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
- Run linter and build before PR:
```
npm run lint
npm run build
```
- Submit PR with clear description and tests (if applicable).

## Code style
- TypeScript: prefer explicit types, avoid `any` where possible.
- Split large functions into small chunks.
- Keep templates in `templates/`, generators in `src/generators/`, types in `src/types`.  
## JSON Schema contributions
- Add schema files under `jsonSchema/`.
- `x-documentConfig.documentName` must match filename (see docs/vexJsonSchema.md).

## PR checklist
- Lint passes
- Build succeeds
- Relevant docs updated
- output app can run
