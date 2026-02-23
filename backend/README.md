# SafeTrack PHP Backend

Consent-based tracking backend with:
- Auth + token sessions
- Consent request/accept/decline flow
- Location update API
- Geofence rules + entry/exit alerts
- Realtime-style polling endpoint
- International phone validation (E.164)
- SMS/call provider hooks (mock provider, Twilio-ready integration point)

## 1) Database Setup (MySQL)

Run:

```sql
SOURCE backend/schema.sql;
```

Or import `backend/schema.sql` from your MySQL client.

## 2) Configure DB

Defaults come from `backend/config.php` and optional environment variables:

- `DB_HOST` (default `127.0.0.1`)
- `DB_PORT` (default `3306`)
- `DB_NAME` (default `safetrack`)
- `DB_USER` (default `root`)
- `DB_PASS` (default empty)
- `COMM_PROVIDER` (default `mock`)

## 3) Run with PHP built-in server

From project root:

```bash
php -S 127.0.0.1:8080 -t backend
```

Then API base URL:

`http://127.0.0.1:8080/api.php`

Health check:

`GET /api.php/health`

## 4) Main Endpoints

### Auth
- `POST /api.php/auth/register`
- `POST /api.php/auth/login`
- `POST /api.php/auth/logout` (Bearer token)

### Consents
- `POST /api.php/consents/request` (Bearer token)
- `GET /api.php/consents` (Bearer token)
- `POST /api.php/consents/{id}/respond` (Bearer token; action: accept|decline)

### Location + Tracking
- `POST /api.php/location/update` (Bearer token)
- `GET /api.php/tracking/live` (Bearer token, optional `consent_id`)
- `GET /api.php/updates/poll?since_alert_id=0&since_location_id=0` (Bearer token)

### Geofencing
- `POST /api.php/geofences` (Bearer token)
- `GET /api.php/geofences?consent_id={id}` (Bearer token)
- `GET /api.php/alerts?since_id=0` (Bearer token)

### Communication Hooks
- `POST /api.php/communications/sms` (Bearer token)
- `POST /api.php/communications/call` (Bearer token)

## 5) E.164 Examples

- Pakistan: `+923001234567`
- US: `+15551234567`
- UK: `+447700900123`

Validation regex: `^\+[1-9]\d{7,14}$`

## 6) Security Notes

- Never track without explicit consent.
- Use HTTPS in production.
- Rotate/expire auth tokens regularly.
- Replace `MockProvider` with a real provider implementation before production messaging/calling.
