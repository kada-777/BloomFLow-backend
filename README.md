# BloomFlow Backend

Backend API for BloomFlow, a flower distribution planning system that manages inventory, sales, demand forecasts, and stock distribution between the head office and branches.

## Technology Stack

- Node.js and Express.js
- PostgreSQL
- Prisma ORM
- JSON Web Tokens (JWT)
- FastAPI forecasting service integration

## Core Features

- JWT authentication and role-based access control
- User, farm, branch, flower, and system configuration management
- Head-office receiving and inventory management
- Branch inventory and daily sales recording
- FIFO-based stock allocation and inventory movements
- Demand forecasting through an external ML service
- Distribution planning, ordering, shipment, and branch receiving
- Head-office and branch dashboard data

## Local Setup

### Prerequisites

- Node.js
- npm
- PostgreSQL
- BloomFlow forecasting service for forecast functionality

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows Command Prompt, use `copy .env.example .env`.

3. Configure the variables in `.env`, including the PostgreSQL connection strings and JWT secret.

4. Apply the database migrations:

   ```bash
   npx prisma migrate deploy
   ```

5. Seed the database if initial data is required:

   ```bash
   npm run db:seed
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

The API runs at `http://localhost:8000` unless `PORT` is configured.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `8000` | HTTP server port |
| `JWT_SECRET` | Yes | None | Secret used to sign and verify JWTs |
| `JWT_EXPIRES_IN` | No | `8h` | JWT expiration duration |
| `DATABASE_URL` | Yes | None | PostgreSQL application connection URL |
| `DIRECT_URL` | Yes | None | PostgreSQL direct connection URL used by Prisma migrations |
| `FRONTEND_URL` | Yes | None | Allowed frontend origin for CORS |
| `FORECAST_SERVICE_URL` | No | `http://127.0.0.1:8001` | Internal forecasting service URL |
| `FORECAST_SERVICE_TIMEOUT_MS` | No | `120000` | Forecast request timeout in milliseconds |

Refer to [`.env.example`](.env.example) for the complete template. Never commit real credentials.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the server |
| `npm run dev` | Start the server with Node.js watch mode |
| `npm run db:seed` | Seed the database through Prisma |

## API Modules

- Authentication
- Users and system configurations
- Farms, branches, and flowers
- Head-office receiving
- Head-office and branch inventory
- Daily sales
- Forecasting
- Distribution plans and orders
- Distribution receiving
- Dashboards

See the [API contract](docs/API_Contract.yaml) for endpoint definitions, authentication rules, roles, request formats, and response formats.

## Architecture

BloomFlow consists of a React/Vite frontend, this Express.js backend, a FastAPI forecasting service, and PostgreSQL. The backend is the orchestration and validation layer: routes delegate requests to controllers and services, while Prisma provides database access and transactions.

The backend owns authentication, authorization, business rules, branch scoping, FIFO allocation, and stock transactions. The forecasting service only produces forecasts and cannot modify operational data.

See [RFC-001: BloomFlow System Architecture](docs/RFC/RFC-001-System-Architecture.md) for the complete architecture and transaction principles.

## Project Structure

```text
BloomFlow-backend/
|-- docs/                 Project documentation and RFCs
|-- prisma/               Database schema, migrations, and seed data
|-- src/
|   |-- config/           Environment configuration
|   |-- controllers/      HTTP request handlers
|   |-- lib/              Shared infrastructure clients
|   |-- middlewares/      Authentication and error handling
|   |-- routes/           API route definitions
|   |-- services/         Business logic and database operations
|   `-- utils/            Shared domain utilities
|-- .env.example          Environment variable template
|-- prisma.config.ts      Prisma configuration
`-- package.json          Dependencies and npm scripts
```

## Documentation

- [API Contract](docs/API_Contract.yaml)
- [Entity Relationship Diagram](docs/ERD.md)
- [Product Requirements Document](docs/PRD_BloomFlow.md)
- [System Architecture RFC](docs/RFC/RFC-001-System-Architecture.md)
- [Feature RFCs](docs/RFC/)

## License

This project is licensed under the ISC License.
