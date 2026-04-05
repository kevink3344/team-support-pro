# TeamSupportPro

TeamSupportPro is a high-density enterprise staff support application built with React, TypeScript, Tailwind CSS, Motion, Lucide, Recharts, and an Express backend. The app can now be deployed either as a single Railway service that serves both the API and the built frontend, or as a split deployment with the frontend hosted separately.

## Current Scope

- React + Vite frontend
- Node + Express API and auth service
- SQL-backed tickets, comments, attachments, directory data, dashboard trends, and dashboard summary
- Team-scoped queues and reassignment rules in the UI
- Theme customization for light and dark modes
- Dashboard analytics and slide-out ticket details

## Local Development

Install dependencies and start the frontend and backend:

```bash
npm install
npm run dev
```

Create your local environment file from the template:

```bash
copy .env.example .env
```

## Environment Variables

Use [.env.example](.env.example) as the source of truth for required variables.

Frontend-safe variables:

- `VITE_APP_NAME`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_BASE_URL`

Backend-only variables:

- `NODE_ENV`
- `SERVER_PORT`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `JWT_SECRET`
- `CLIENT_URL`
- `ALLOWED_ORIGINS`
- `COOKIE_SAME_SITE`
- `DB_SERVER`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USER`
- `DB_PASSWORD`
- `AUTH_USER_LOOKUP_QUERY`

Important: only variables prefixed with `VITE_` are exposed to browser code in a Vite app. Database credentials, JWT secrets, and OAuth client secrets remain on the backend service.

Deployment notes:

- For a single-service Railway deploy, leave `VITE_API_BASE_URL` empty so the browser calls the same origin that served the app.
- For a split deploy, set `VITE_API_BASE_URL` to your backend URL, set `CLIENT_URL` to your frontend URL, set `ALLOWED_ORIGINS` to the frontend origin or a comma-separated list of allowed origins, and set `COOKIE_SAME_SITE=none`.
- Railway injects `PORT`; the backend now uses it automatically in production.

## Authentication Flow

- The sign-in screen in the frontend remains the production UI.
- Google Sign-In uses the browser credential flow, then posts the returned credential to `/api/auth/google/client`.
- The backend verifies the Google ID token and creates a signed HTTP-only session cookie.
- The frontend restores the saved session through `/api/auth/me`, so refresh does not log the user out.
- User role and team are pulled from SQL Server if `AUTH_USER_LOOKUP_QUERY` is configured. If no database match is available yet, the app falls back to the seeded mock directory so testing can continue.

## Ticket Activity Persistence

- After sign-in, the frontend loads ticket records from SQL Server through `/api/tickets`.
- Teams, categories, and users are loaded from SQL Server through `/api/directory` after authentication.
- New ticket creation is persisted to SQL Server through `/api/tickets`.
- Ticket detail edits are persisted to SQL Server through `/api/tickets/:ticketId` and the backend creates the corresponding activity entries.
- Ticket comments are written to SQL Server through `/api/tickets/:ticketId/comments`, and the backend derives the comment actor from the signed session cookie instead of trusting the client payload.
- Ticket attachments are stored directly in SQL Server through `dbo.TicketAttachments` and exposed by `/api/tickets/:ticketId/attachments` routes.
- Dashboard metric cards, status overview, and team workload summary are loaded from SQL Server through `/api/dashboard/summary`.
- Dashboard trend data is loaded from SQL Server through `/api/dashboard/trends`.
- Ticket reads, creates, updates, and comments are scoped server-side to the signed-in user's team.
- The app still keeps the seeded mock data in the repo as fallback/reference data, but the active ticket workspace and directory bootstrap now hydrate from SQL after authentication.

## CRUD API Surface

Authenticated reads:

- `GET /api/teams`
- `GET /api/teams/:teamId`
- `GET /api/categories`
- `GET /api/categories/:categoryId`
- `GET /api/users`
- `GET /api/users/:userId`
- `GET /api/tickets`
- `GET /api/tickets/:ticketId`

Admin-only directory writes:

- `POST /api/teams`
- `PATCH /api/teams/:teamId`
- `DELETE /api/teams/:teamId`
- `POST /api/categories`
- `PATCH /api/categories/:categoryId`
- `DELETE /api/categories/:categoryId`
- `POST /api/users`
- `PATCH /api/users/:userId`
- `DELETE /api/users/:userId`

Team-scoped ticket writes:

- `POST /api/tickets`
- `PATCH /api/tickets/:ticketId`
- `DELETE /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/comments`

Team-scoped attachment operations:

- `GET /api/tickets/:ticketId/attachments`
- `POST /api/tickets/:ticketId/attachments`
- `GET /api/tickets/:ticketId/attachments/:attachmentId`
- `DELETE /api/tickets/:ticketId/attachments/:attachmentId`

Notes:

- Directory create endpoints accept optional `id` fields so you can preserve spreadsheet identifiers when importing.
- Ticket create accepts an optional `id` field as well; otherwise the server generates a `TKT-xxxxx` ID.
- Team and category deletes can fail if related rows still exist because SQL foreign keys are enforced.
- Attachment uploads are limited to 10 MB per file and are stored as `VARBINARY(MAX)` in SQL Server for this implementation.

## API Reference

See [docs/API.md](docs/API.md) for a mini API reference with authentication requirements, request payloads, and response shapes.

## Deployment

### GitHub

Initialize the repository and push it to GitHub:

```bash
git init
git add .
git commit -m "Prepare TeamSupportPro for deployment"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Railway: Single Service

Use this when Railway should host both the frontend and backend.

- Build command: `npm run build`
- Start command: `npm start`
- Required environment variables:
	- `NODE_ENV=production`
	- `JWT_SECRET`
	- `VITE_GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_SECRET` only if you use the redirect flow
	- `GOOGLE_REDIRECT_URI` if you use the redirect flow
	- `CLIENT_URL=https://<your-railway-domain>`
	- `ALLOWED_ORIGINS=https://<your-railway-domain>`
	- `COOKIE_SAME_SITE=lax`
	- `DB_SERVER`
	- `DB_PORT=1433`
	- `DB_DATABASE`
	- `DB_USER`
	- `DB_PASSWORD`
	- `AUTH_USER_LOOKUP_QUERY`

Set your Google Authorized JavaScript origin to the Railway app URL. If you keep the redirect flow enabled, also set the Authorized redirect URI to `https://<your-railway-domain>/auth/google/callback`.

### Split Deployment

Use this when the frontend is hosted separately and Railway hosts only the backend.

- Frontend build environment:
	- `VITE_GOOGLE_CLIENT_ID`
	- `VITE_API_BASE_URL=https://<your-railway-backend-domain>`
- Railway backend environment:
	- `NODE_ENV=production`
	- `JWT_SECRET`
	- `GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_SECRET` only if you use the redirect flow
	- `GOOGLE_REDIRECT_URI=https://<your-railway-backend-domain>/auth/google/callback` if you use the redirect flow
	- `CLIENT_URL=https://<your-frontend-domain>`
	- `ALLOWED_ORIGINS=https://<your-frontend-domain>`
	- `COOKIE_SAME_SITE=none`
	- `DB_SERVER`
	- `DB_PORT=1433`
	- `DB_DATABASE`
	- `DB_USER`
	- `DB_PASSWORD`
	- `AUTH_USER_LOOKUP_QUERY`

For split hosting, your cookie must be cross-site, so `COOKIE_SAME_SITE=none` is required and HTTPS is mandatory.

## Verification

Production build:

```bash
npm run build
```

Production start after build:

```bash
npm start
```

*** Add File: c:\Users\keyke\Desktop\Vibe Coding Apps\team-support-pro\docs\API.md
# TeamSupportPro API Reference

This document describes the active HTTP API exposed by the Express backend in [server/index.ts](../server/index.ts).

## Base URL

- Local development API: `http://localhost:3001`
- Production API: your Railway service URL or the same origin that serves the app

When the frontend is hosted separately, browser requests must be sent with credentials enabled so the session cookie is included.

Example:

```ts
fetch('/api/auth/me', {
	credentials: 'include',
})
```

## Authentication

### Primary auth method

TeamSupportPro uses Google Sign-In in the browser, then exchanges the Google credential for a signed backend session.

Flow:

1. The frontend gets a Google ID token from the browser sign-in flow.
2. The frontend posts that token to `POST /api/auth/google/client`.
3. The backend verifies the token and sets an HTTP-only session cookie.
4. Protected API routes read the signed cookie on subsequent requests.

### Session cookie

- Cookie type: HTTP-only signed JWT session
- Default lifetime: 7 days
- Cookie settings are controlled by `COOKIE_SAME_SITE`, `CLIENT_URL`, and `ALLOWED_ORIGINS`

### Authorization model

- `401 unauthenticated`: no valid session cookie
- `403 admin_required`: authenticated user is not an admin for an admin-only route
- `403 cross_team_*_forbidden`: authenticated user attempted a ticket action outside their team scope

### Auth endpoints

#### `POST /api/auth/google/client`

Exchange a Google browser credential for a backend session cookie.

Request body:

```json
{
	"credential": "<google-id-token>"
}
```

Success response `200`:

```json
{
	"authenticated": true,
	"user": {
		"subject": "google-subject-id",
		"name": "Kevin Key",
		"email": "key.kevin@gmail.com",
		"picture": "https://..."
	}
}
```

Possible errors:

- `400 missing_credential`
- `400 invalid_google_payload`
- `401 google_auth_failed`

#### `GET /api/auth/me`

Returns the current authenticated session user.

Success response `200`:

```json
{
	"authenticated": true,
	"user": {
		"id": "u-kevin",
		"name": "Kevin Key",
		"email": "key.kevin@gmail.com",
		"role": "Admin",
		"teamId": "it",
		"teamName": "IT Support",
		"teamCode": "IT",
		"teamAccent": "#0078d4",
		"picture": "https://..."
	}
}
```

Unauthenticated response `401`:

```json
{
	"authenticated": false
}
```

#### `POST /api/auth/logout`

Clears the session cookie.

Success response: `204 No Content`

#### `GET /auth/google`

Starts the redirect-based Google OAuth flow. This route is optional if you only use browser credential sign-in.

#### `GET /auth/google/callback`

Completes the redirect-based Google OAuth flow and redirects back to the frontend.

## General response patterns

Common success envelopes:

- `{ "teams": [...] }`
- `{ "categories": [...] }`
- `{ "users": [...] }`
- `{ "tickets": [...] }`
- `{ "ticket": {...} }`
- `{ "summary": {...} }`
- `{ "trends": [...] }`
- `{ "attachments": [...] }`
- `{ "attachment": {...} }`
- `{ "comment": {...} }`

Common error envelopes:

```json
{
	"error": "unauthenticated"
}
```

```json
{
	"error": "ticket_not_found"
}
```

## Health

#### `GET /api/health`

Simple liveness endpoint.

Response `200`:

```json
{
	"ok": true
}
```

## Directory

Directory routes are used for teams, categories, and users. Reads require authentication. Writes require an admin session.

### Combined directory bootstrap

#### `GET /api/directory`

Response `200`:

```json
{
	"teams": [
		{
			"id": "it",
			"name": "IT Support",
			"code": "IT",
			"accent": "#0078d4"
		}
	],
	"categories": [
		{
			"id": "cat-it-password",
			"teamId": "it",
			"name": "Password Reset",
			"description": "Password and access issues."
		}
	],
	"users": [
		{
			"id": "u-kevin",
			"name": "Kevin Key",
			"email": "key.kevin@gmail.com",
			"teamId": "it",
			"role": "Admin"
		}
	]
}
```

### Teams

#### `GET /api/teams`

Response `200`:

```json
{
	"teams": [
		{
			"id": "it",
			"name": "IT Support",
			"code": "IT",
			"accent": "#0078d4"
		}
	]
}
```

#### `GET /api/teams/:teamId`

Response `200`:

```json
{
	"team": {
		"id": "it",
		"name": "IT Support",
		"code": "IT",
		"accent": "#0078d4"
	}
}
```

#### `POST /api/teams`

Admin only.

Request body:

```json
{
	"id": "it",
	"name": "IT Support",
	"code": "IT",
	"accent": "#0078d4"
}
```

Notes:

- `id` is optional; if omitted, the backend generates one from the team name.

Response `201`:

```json
{
	"team": {
		"id": "it",
		"name": "IT Support",
		"code": "IT",
		"accent": "#0078d4"
	}
}
```

#### `PATCH /api/teams/:teamId`

Admin only.

Request body:

```json
{
	"name": "IT Support",
	"code": "IT",
	"accent": "#0078d4"
}
```

Response `200`: same shape as `POST /api/teams`

#### `DELETE /api/teams/:teamId`

Admin only.

Response: `204 No Content`

### Categories

#### `GET /api/categories`

Response `200`:

```json
{
	"categories": [
		{
			"id": "cat-it-password",
			"teamId": "it",
			"name": "Password Reset",
			"description": "Password and access issues."
		}
	]
}
```

#### `GET /api/categories/:categoryId`

Response `200`:

```json
{
	"category": {
		"id": "cat-it-password",
		"teamId": "it",
		"name": "Password Reset",
		"description": "Password and access issues."
	}
}
```

#### `POST /api/categories`

Admin only.

Request body:

```json
{
	"id": "cat-it-password",
	"teamId": "it",
	"name": "Password Reset",
	"description": "Password and access issues."
}
```

Notes:

- `id` is optional; if omitted, the backend generates one from the team and category name.

Response `201`: `{ "category": { ... } }`

#### `PATCH /api/categories/:categoryId`

Admin only.

Request body:

```json
{
	"teamId": "it",
	"name": "Password Reset",
	"description": "Password and access issues."
}
```

Response `200`: `{ "category": { ... } }`

#### `DELETE /api/categories/:categoryId`

Admin only.

Response: `204 No Content`

### Users

#### `GET /api/users`

Response `200`:

```json
{
	"users": [
		{
			"id": "u-kevin",
			"name": "Kevin Key",
			"email": "key.kevin@gmail.com",
			"teamId": "it",
			"role": "Admin"
		}
	]
}
```

#### `GET /api/users/:userId`

Response `200`:

```json
{
	"user": {
		"id": "u-kevin",
		"name": "Kevin Key",
		"email": "key.kevin@gmail.com",
		"teamId": "it",
		"role": "Admin"
	}
}
```

#### `POST /api/users`

Admin only.

Request body:

```json
{
	"id": "u-kevin",
	"name": "Kevin Key",
	"email": "key.kevin@gmail.com",
	"teamId": "it",
	"role": "Admin"
}
```

Notes:

- `id` is optional; if omitted, the backend generates one from the user name.
- `role` must be `Admin` or `Staff`.

Response `201`: `{ "user": { ... } }`

#### `PATCH /api/users/:userId`

Admin only.

Request body:

```json
{
	"name": "Kevin Key",
	"email": "key.kevin@gmail.com",
	"teamId": "it",
	"role": "Admin"
}
```

Response `200`: `{ "user": { ... } }`

#### `DELETE /api/users/:userId`

Admin only.

Response: `204 No Content`

## Dashboard

Dashboard routes require authentication.

#### `GET /api/dashboard/trends`

Response `200`:

```json
{
	"trends": [
		{
			"date": "Apr 1",
			"values": {
				"it": 7,
				"facilities": 3,
				"learning": 2
			}
		}
	]
}
```

#### `GET /api/dashboard/summary`

Response `200`:

```json
{
	"summary": {
		"stats": {
			"total": 42,
			"open": 10,
			"inProgress": 12,
			"pending": 7,
			"critical": 3
		},
		"statusCounts": [
			{ "status": "Open", "count": 10 },
			{ "status": "In Progress", "count": 12 },
			{ "status": "Pending", "count": 7 },
			{ "status": "Resolved", "count": 9 },
			{ "status": "Closed", "count": 4 }
		],
		"teamWorkload": [
			{ "teamId": "it", "count": 14 },
			{ "teamId": "facilities", "count": 8 }
		]
	}
}
```

## Tickets

Ticket routes require authentication. Read and write access is team-scoped on the server.

Valid ticket statuses:

- `Open`
- `In Progress`
- `Pending`
- `Resolved`
- `Closed`

Valid ticket priorities:

- `Low`
- `Medium`
- `High`
- `Critical`

#### `GET /api/tickets`

Returns all tickets visible to the authenticated user’s team.

Response `200`:

```json
{
	"tickets": [
		{
			"id": "TKT-12345",
			"title": "Cannot access VPN",
			"description": "Laptop cannot connect to VPN.",
			"status": "Open",
			"priority": "High",
			"teamId": "it",
			"categoryId": "cat-it-network",
			"assignedToId": "u-kevin",
			"requestorName": "Jane Doe",
			"requestorEmail": "jane.doe@example.com",
			"location": "HQ - 4th Floor",
			"dueLabel": "New in queue",
			"createdAt": "2026-04-05T15:20:00.000Z",
			"updatedAt": "2026-04-05T15:20:00.000Z",
			"activity": [
				{
					"id": "comment-...",
					"actor": "Kevin Key",
					"message": "Ticket created from TeamSupportPro.",
					"at": "2026-04-05T15:20:00.000Z"
				}
			]
		}
	]
}
```

#### `GET /api/tickets/:ticketId`

Response `200`: `{ "ticket": { ...same ticket shape... } }`

#### `GET /api/tickets/activity`

Returns activity entries for tickets visible to the current user’s team.

Response `200`:

```json
{
	"activity": [
		{
			"id": "comment-...",
			"ticketId": "TKT-12345",
			"actor": "Kevin Key",
			"message": "Investigating the issue.",
			"at": "2026-04-05T16:00:00.000Z"
		}
	]
}
```

#### `POST /api/tickets`

Creates a ticket for the authenticated user’s team only.

Request body:

```json
{
	"id": "TKT-12345",
	"title": "Cannot access VPN",
	"description": "Laptop cannot connect to VPN.",
	"priority": "High",
	"teamId": "it",
	"categoryId": "cat-it-network",
	"assignedToId": "u-kevin",
	"requestorName": "Jane Doe",
	"requestorEmail": "jane.doe@example.com",
	"location": "HQ - 4th Floor"
}
```

Notes:

- `id` is optional. If omitted, the server generates a `TKT-xxxxx` identifier.
- `teamId` must match the authenticated user’s `teamId`.
- `categoryId` must belong to the same team.
- `assignedToId`, if provided, must belong to the same team.

Response `201`: `{ "ticket": { ...same ticket shape... } }`

#### `PATCH /api/tickets/:ticketId`

Updates an existing ticket in the authenticated user’s team.

Request body:

```json
{
	"title": "Cannot access VPN",
	"description": "Laptop cannot connect to VPN from home.",
	"status": "In Progress",
	"priority": "High",
	"categoryId": "cat-it-network",
	"assignedToId": "u-kevin"
}
```

Response `200`: `{ "ticket": { ...same ticket shape... } }`

#### `DELETE /api/tickets/:ticketId`

Deletes the ticket, its activity rows, and attachment rows.

Response: `204 No Content`

#### `POST /api/tickets/:ticketId/comments`

Adds a comment activity entry to a ticket in the authenticated user’s team.

Request body:

```json
{
	"message": "Investigating the issue now."
}
```

Response `201`:

```json
{
	"comment": {
		"id": "comment-...",
		"ticketId": "TKT-12345",
		"actor": "Kevin Key",
		"message": "Investigating the issue now.",
		"at": "2026-04-05T16:00:00.000Z"
	}
}
```

## Attachments

Attachment routes require authentication and team-scoped access to the parent ticket.

Upload constraints:

- Maximum file size: 10 MB per file
- Storage backend: SQL Server `VARBINARY(MAX)`
- Upload type: `multipart/form-data`

#### `GET /api/tickets/:ticketId/attachments`

Response `200`:

```json
{
	"attachments": [
		{
			"id": "att-...",
			"ticketId": "TKT-12345",
			"fileName": "vpn-log.txt",
			"contentType": "text/plain",
			"fileSizeBytes": 4821,
			"uploadedByUserId": "u-kevin",
			"uploadedByName": "Kevin Key",
			"uploadedAt": "2026-04-05T16:10:00.000Z"
		}
	]
}
```

#### `POST /api/tickets/:ticketId/attachments`

Upload a file under the form field name `file`.

Request type:

```text
multipart/form-data
```

Form fields:

- `file`: binary file payload

Response `201`:

```json
{
	"attachment": {
		"id": "att-...",
		"ticketId": "TKT-12345",
		"fileName": "vpn-log.txt",
		"contentType": "text/plain",
		"fileSizeBytes": 4821,
		"uploadedByUserId": "u-kevin",
		"uploadedByName": "Kevin Key",
		"uploadedAt": "2026-04-05T16:10:00.000Z"
	}
}
```

Possible errors:

- `400 missing_attachment_file`
- `400 attachment_too_large`
- `500 attachment_create_failed`

#### `GET /api/tickets/:ticketId/attachments/:attachmentId`

Downloads the raw file bytes.

Response:

- Binary response body
- `Content-Type` set to the stored file MIME type
- `Content-Disposition` set as an attachment download

#### `DELETE /api/tickets/:ticketId/attachments/:attachmentId`

Soft-deletes the attachment and records an activity entry.

Response: `204 No Content`

## Typical protected-route errors

```json
{ "error": "unauthenticated" }
```

```json
{ "error": "admin_required" }
```

```json
{ "error": "ticket_not_found" }
```

```json
{ "error": "cross_team_ticket_update_forbidden" }
```

```json
{ "error": "attachment_not_found" }
```

## Source of truth

If this document and the code ever diverge, treat these files as the source of truth:

- [server/index.ts](../server/index.ts)
- [server/tickets.ts](../server/tickets.ts)
- [server/directory.ts](../server/directory.ts)
- [server/attachments.ts](../server/attachments.ts)
- [server/dashboard.ts](../server/dashboard.ts)
- [server/trends.ts](../server/trends.ts)
