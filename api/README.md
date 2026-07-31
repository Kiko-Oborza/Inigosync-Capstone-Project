# PHP Auth API

This folder contains a simple PHP endpoint for Google authentication.

## Files
- auth/google.php - accepts the Google credential from the frontend and returns a demo session payload

## Run locally
Use a local PHP server from the project root:

```bash
php -S localhost:8000
```

Then open:

```text
http://localhost:8000/Pages/Index.html
```

The frontend will call:

```text
http://localhost:8000/api/auth/google.php
```

## Note
This is a starter implementation. For production, replace the demo token logic with real server-side Google token verification and a proper database-backed user session.
