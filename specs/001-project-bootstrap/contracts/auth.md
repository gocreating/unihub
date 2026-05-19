# API Contract: Authentication

**Base prefix**: `/api/v1/auth/`

All endpoints use session-based authentication (Django session cookie).

---

## GET /api/v1/auth/me/

Returns the currently authenticated user.

**Auth**: Session required

**Response 200**:
```json
{
  "id": 1,
  "username": "string",
  "email": "string"
}
```

**Response 401**: Not authenticated

---

## POST /api/v1/auth/login/

**Auth**: None (public)

**Request body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200**: `{}` (session cookie set)

**Response 400**: Invalid credentials

---

## POST /api/v1/auth/logout/

**Auth**: Session required

**Response 200**: `{}` (session cookie cleared)
