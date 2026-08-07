# Deployment Guide — PulseQ Emergency Portal

This guide provides step-by-step instructions to deploy:
1. **Frontend (Angular 19 SPA)** to **Vercel**
2. **Backend (FastAPI + PostgreSQL + WebSockets)** to **Render**

---

## 1. Deploying Backend & PostgreSQL to Render

### Option A: Using Render Blueprints (Recommended)
1. Push your repository to GitHub / GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** -> **Blueprint**.
4. Connect your repository and select `Emergency/backend/render.yaml`.
5. Render will automatically provision:
   - **PostgreSQL Database** (`pulseq-emergency-db`)
   - **FastAPI Web Service** (`pulseq-emergency-backend`)
6. Once deployed, Render will provide your Backend URL:
   `https://pulseq-emergency-backend.onrender.com`

### Option B: Manual Web Service Setup on Render
1. **Create PostgreSQL Database**:
   - Dashboard -> **New +** -> **PostgreSQL**.
   - Name: `pulseq-emergency-db`.
   - Copy the Internal Database URL.
2. **Create Web Service**:
   - Dashboard -> **New +** -> **Web Service**.
   - Root Directory: `Emergency/backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `ENVIRONMENT` = `production`
     - `DATABASE_URL` = `<Render Internal PostgreSQL URL>`
     - `JWT_SECRET` = `<Generate Random Secret Key>`
     - `PULSEQ_SHARED_SECRET` = `<Shared HMAC Secret>`
     - `CORS_ORIGINS` = `https://<your-vercel-app>.vercel.app`
     - `SEED_DEMO_DATA` = `true`

---

## 2. Deploying Angular Frontend to Vercel

### Option A: Via GitHub Integration (Recommended)
1. Push your repository to GitHub.
2. Log into [Vercel Dashboard](https://vercel.com/dashboard).
3. Click **Add New...** -> **Project**.
4. Import your repository and set the **Root Directory** to `Emergency/PulseQ-Emergency`.
5. Vercel automatically detects `vercel.json`:
   - **Build Command**: `npx ng build --configuration production`
   - **Output Directory**: `dist/PulseQ-Emergency/browser`
6. Click **Deploy**.

### Option B: Via Vercel CLI
From your terminal in `Emergency/PulseQ-Emergency`:
```bash
npx vercel --prod
```

---

## 3. Production Environment Variables Summary

### Backend (Render):
| Variable | Example Value | Notes |
|---|---|---|
| `ENVIRONMENT` | `production` | Enables strict CORS and requires JWT_SECRET |
| `DATABASE_URL` | `postgresql://...` | Connection string to PostgreSQL instance |
| `JWT_SECRET` | `<32-char-random-string>` | Secret key for signing JWT auth tokens |
| `PULSEQ_SHARED_SECRET` | `<hmac-secret-key>` | Shared secret for PulseQ webhook verification |
| `CORS_ORIGINS` | `https://your-app.vercel.app` | Allowed frontend origins |
| `SEED_DEMO_DATA` | `true` | Seed initial ER Nurse account & doctor registry |

### Frontend (Vercel):
Configure `src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  apiBaseUrl: 'https://pulseq-emergency-backend.onrender.com/api/v1',
  wsBaseUrl: 'wss://pulseq-emergency-backend.onrender.com/api/v1/emergency/ws'
};
```
