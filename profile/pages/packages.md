<!--
  GENERATED FILE — DO NOT EDIT.
  Rendered from profile/data/content.json + the GitHub API by
  scripts/generate-profile.mjs. Last generated: 2026-08-14
-->

# Packages

Libraries I publish and maintain on npm. Each one came out of a real service that needed it twice.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/hector-ae21/hector-ae21/main/profile/assets/pages/packages/installs-dark.svg">
  <img alt="Installs, last 30 days" src="https://raw.githubusercontent.com/hector-ae21/hector-ae21/main/profile/assets/pages/packages/installs-light.svg" width="100%">
</picture>

<sub>Downloads reported by the npm registry for the last 30 days. Counted per package, and it counts machines rather than people — a CI pipeline installing on every build is in there too.</sub>

---

<h2><a href="https://github.com/resilientmq/core">@resilientmq/core</a></h2>

<p><sub><b>Author</b></sub></p>

<p><img alt="npm version" src="https://img.shields.io/npm/v/@resilientmq/core?style=flat-square&color=0969da&labelColor=1f2328&label=npm"> <img alt="npm downloads" src="https://img.shields.io/npm/dm/@resilientmq/core?style=flat-square&color=0969da&labelColor=1f2328&label=downloads"> <img alt="license" src="https://img.shields.io/github/license/resilientmq/core?style=flat-square&color=0969da&labelColor=1f2328&label=license"> <img alt="last commit" src="https://img.shields.io/github/last-commit/resilientmq/core?style=flat-square&color=0969da&labelColor=1f2328&label=last%20commit"></p>

Resilient event processing for RabbitMQ. Declares which events a consumer handles, then takes care of everything that can go wrong around them: retry policy, dead-letter routing, per-event state so a redelivery is not reprocessed, and a controlled way to mark an event as deliberately ignored rather than failed.

```bash
npm install @resilientmq/core
```

<p><sub><code>TypeScript</code> <code>RabbitMQ</code> <code>amqplib</code> <code>Testcontainers</code></sub></p>

---

<h2><a href="https://github.com/didactika/prisma-autoread">@didactika/prisma-autoread</a></h2>

<p><sub><b>Lead contributor</b></sub></p>

<p><img alt="npm version" src="https://img.shields.io/npm/v/@didactika/prisma-autoread?style=flat-square&color=0969da&labelColor=1f2328&label=npm"> <img alt="npm downloads" src="https://img.shields.io/npm/dm/@didactika/prisma-autoread?style=flat-square&color=0969da&labelColor=1f2328&label=downloads"> <img alt="license" src="https://img.shields.io/github/license/didactika/prisma-autoread?style=flat-square&color=0969da&labelColor=1f2328&label=license"> <img alt="last commit" src="https://img.shields.io/github/last-commit/didactika/prisma-autoread?style=flat-square&color=0969da&labelColor=1f2328&label=last%20commit"></p>

Drop-in search endpoints for Express and Prisma. One declaration yields filtering, sorting, field selection, relation includes, aggregations and both offset and cursor pagination — over GET, the new QUERY method or POST — emitting HAL, JSON:API or CSV.

```bash
npm install @didactika/prisma-autoread
```

<p><sub><code>TypeScript</code> <code>Prisma</code> <code>Express</code> <code>Fastify</code> <code>Hono</code></sub></p>

---

<h2><a href="https://github.com/hector-ae21/http-response-client">http-response-client</a></h2>

<p><sub><b>Author</b></sub></p>

<p><img alt="npm version" src="https://img.shields.io/npm/v/http-response-client?style=flat-square&color=0969da&labelColor=1f2328&label=npm"> <img alt="npm downloads" src="https://img.shields.io/npm/dm/http-response-client?style=flat-square&color=0969da&labelColor=1f2328&label=downloads"> <img alt="license" src="https://img.shields.io/github/license/hector-ae21/http-response-client?style=flat-square&color=0969da&labelColor=1f2328&label=license"> <img alt="last commit" src="https://img.shields.io/github/last-commit/hector-ae21/http-response-client?style=flat-square&color=0969da&labelColor=1f2328&label=last%20commit"></p>

One shape for every response an Express service returns, success or failure. Typed constructors for the standard HTTP errors, custom errors on the same contract, and middleware that turns a thrown error into a well-formed body instead of a stack trace.

```bash
npm install http-response-client
```

<p><sub><code>TypeScript</code> <code>Express</code></sub></p>

---

<h2><a href="https://github.com/resilientmq/mongoose-connector">@resilientmq/mongoose-connector</a></h2>

<p><sub><b>Author</b></sub></p>

<p><img alt="npm version" src="https://img.shields.io/npm/v/@resilientmq/mongoose-connector?style=flat-square&color=0969da&labelColor=1f2328&label=npm"> <img alt="npm downloads" src="https://img.shields.io/npm/dm/@resilientmq/mongoose-connector?style=flat-square&color=0969da&labelColor=1f2328&label=downloads"> <img alt="license" src="https://img.shields.io/github/license/resilientmq/mongoose-connector?style=flat-square&color=0969da&labelColor=1f2328&label=license"> <img alt="last commit" src="https://img.shields.io/github/last-commit/resilientmq/mongoose-connector?style=flat-square&color=0969da&labelColor=1f2328&label=last%20commit"></p>

MongoDB storage backend for ResilientMQ. Persists event state through Mongoose so consumer restarts and redeliveries stay idempotent.

```bash
npm install @resilientmq/mongoose-connector
```

<p><sub><code>TypeScript</code> <code>Mongoose</code> <code>MongoDB</code></sub></p>

---

<sub><a href="https://github.com/hector-ae21">← Back to profile</a></sub>
