# BloomFlow Backend README Design

## Goal

Create an English `README.md` that gives developers and project reviewers a concise, accurate entry point to the BloomFlow backend repository.

## Content

The README will contain these sections:

1. Project Overview
2. Technology Stack
3. Core Features
4. Local Setup
5. Environment Variables
6. Available Scripts
7. API Modules
8. Architecture
9. Project Structure
10. Documentation Links
11. License

## Content Rules

- Describe only capabilities and commands verified in the repository.
- Keep API coverage at module level and link to `docs/API_Contract.yaml` for details.
- Link to the existing ERD, PRD, and architecture RFC instead of duplicating them.
- Document environment variable names without exposing credentials.
- Exclude testing instructions and the `npm test` command.
- Avoid speculative badges, deployment instructions, contribution guidance, and duplicated endpoint tables.

## Setup Flow

The local setup will cover installing dependencies, creating `.env` from `.env.example`, configuring PostgreSQL and service URLs, applying Prisma migrations, optionally seeding initial data, and starting the development server.

## Success Criteria

- GitHub renders the README from the backend repository root.
- A new developer can understand the backend and start it locally.
- A reviewer can quickly find the stack, features, architecture, API modules, and detailed project documents.
- The content stays concise and does not include a testing section.
