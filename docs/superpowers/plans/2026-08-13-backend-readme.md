# BloomFlow Backend README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an English repository-root README that introduces the BloomFlow backend and explains how to run it locally.

**Architecture:** Add one documentation file at the backend repository root. Keep detailed API and system documentation in the existing `docs` files and link to them from the README rather than duplicating them.

**Tech Stack:** Markdown, Node.js, Express.js, PostgreSQL, Prisma ORM, JWT, FastAPI

## Global Constraints

- Describe only capabilities and commands verified in the repository.
- Keep API coverage at module level and link to `docs/API_Contract.yaml` for details.
- Document environment variable names without exposing credentials.
- Exclude testing instructions and the `npm test` command.
- Avoid speculative badges, deployment instructions, contribution guidance, and duplicated endpoint tables.

---

### Task 1: Create Backend README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `package.json`, `.env.example`, `src/routes/index.js`, `src/config/env.js`, `prisma.config.ts`, and existing files under `docs/`
- Produces: GitHub-rendered backend documentation at the repository root

- [ ] **Step 1: Write the README**

Create `README.md` with these sections in order: Project Overview, Technology Stack, Core Features, Local Setup, Environment Variables, Available Scripts, API Modules, Architecture, Project Structure, Documentation, and License.

Use commands that match the repository:

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

List only the approved public scripts:

```text
npm start
npm run dev
npm run db:seed
```

- [ ] **Step 2: Verify content and links**

Confirm that `README.md` contains no testing section or `npm test`, and that each relative documentation link resolves to an existing file:

```text
docs/API_Contract.yaml
docs/ERD.md
docs/PRD_BloomFlow.md
docs/RFC/RFC-001-System-Architecture.md
```

- [ ] **Step 3: Review the rendered structure**

Check heading order, fenced code blocks, tables, and the directory tree for valid GitHub-flavored Markdown. Confirm setup commands and environment defaults match the source files.
