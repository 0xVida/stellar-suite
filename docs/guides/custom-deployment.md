# Guide: Building and Deploying PWA Version

This guide outlines the steps to customize, brand, build, and deploy your own white-labeled instance of the Stellar Suite IDE as a Progressive Web App (PWA).

---

## 1. Customization & White-Labeling

To customize the branding of your IDE instance, you will need to replace the static branding assets and configure styling tokens.

### 1.1 Branding Assets
Replace the default assets in the `/ide/public` directory:
- **Application Icon (`ide/public/icon.png`):** Put your main brand logo here (minimum size: `512x512` px, square format).
- **Web App Manifest (`ide/public/manifest.json`):** Modify metadata fields to match your company's name and branding:

```json
{
  "name": "Custom Stellar IDE",
  "short_name": "StellarIDE",
  "description": "An enterprise-ready custom IDE for Soroban Smart Contracts",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0d1117",
  "theme_color": "#00d2ff",
  "icons": [
    {
      "src": "/pwa-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/pwa-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### 1.2 Theme Color & CSS Customization
Adjust core colors and branding accents by updating style tokens in `/ide/src/styles/theme.css` (or equivalent global CSS variables):

```css
:root {
  --brand-primary: #00d2ff;       /* Primary interactive color */
  --brand-secondary: #7000ff;     /* Secondary highlight color */
  --bg-main: #0a0e17;             /* IDE editor main background */
  --text-main: #f0f3f6;           /* Standard text color */
  --font-family: 'Outfit', sans-serif;
}
```

### 1.3 Generating PWA Icons
The project contains an automated script to generate responsive icons from your primary `icon.png`:

```bash
cd ide
node generate-pwa-icons.mjs
```
*Output:*
```text
[Success] Resized icon.png to pwa-192x192.png
[Success] Resized icon.png to pwa-512x512.png
PWA assets successfully generated!
```

---

## 2. Environment Configuration

Create a `.env.production` file inside the `ide` folder. Define the following configuration variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Display name of the white-labeled IDE | `"Custom Stellar IDE"` |
| `OPENAI_API_KEY` | Key for the AI Soroban Assistant features | `sk-proj-4a...` |
| `OPENAI_MODEL` | AI engine to power the code assistant | `gpt-4o-mini` |
| `NEXTAUTH_SECRET` | Secret key used to encrypt user auth cookies | `e2a8...3b9c` |
| `NEXTAUTH_URL` | Root URL of the deployed IDE service | `https://ide.company.com` |
| `SUPABASE_URL` | Endpoint for hosting contract state database | `https://prj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Key to authorize secure schema read/writes | `eyJhbGci...` |
| `ALLOWED_ORIGINS` | CORS allowed domains (comma-separated) | `https://ide.company.com` |

---

## 3. Deployment Options

### 3.1 Vercel (Recommended)
Stellar Suite IDE is designed for Next.js, making Vercel the optimal target.

1. Create a new project in your Vercel Dashboard linked to the repository.
2. Under **Project Settings**, configure:
   - **Root Directory:** `ide`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
3. Add all variables listed in the Environment Configuration section.
4. Click **Deploy**.

### 3.2 Docker & Self-Hosting
For air-gapped or private cloud deployments, build a Docker image using the Next.js standalone output.

**Example Multi-stage Dockerfile (`/ide/Dockerfile`):**
```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

---

## 4. Verification & Deployment Checklist

To guarantee a clean PWA installation and verify that resources are correctly configured:

### 4.1 Local PWA Build Check
Run the production build locally to verify there are no Webpack or TypeScript compilation errors:

```bash
# Build the production target
npm run build
```
*Output:*
```text
> stellar-suite-ide@1.0.0 build
> next build

   ▲ Next.js 14.2.3
   - Env: Production

   Creating an optimized production build ...
   ✓ Compiled successfully
   Linting and checking validity of types ...
   ✓ No TypeScript or ESLint errors detected
   Collecting page data ...
   ✓ Generating static pages
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    12.4 kB         114 kB
├ ○ /api/health                          0 B                  0 B
└ ○ /api/ready                           0 B                  0 B
+ First Load JS shared by all            101 kB
  ├ chunks/framework-2c79e2a64ab17db2.js 45 kB
  ├ chunks/main-8fd2c8c46f1891b9.js      52 kB
  └ other shared chunks                  4 kB

✓ Standalone server build generated successfully.
```

### 4.2 Production Docker Verification
Verify that the Docker container compiles and exposes the web app correctly:

```bash
# Build Docker image
docker build -t custom-stellar-ide:latest -f ./ide/Dockerfile ./ide
```
*Output:*
```text
[+] Building 24.1s (15/15) FINISHED
 => [internal] load build definition from Dockerfile
 => [internal] load .dockerignore
 => [internal] load metadata for docker.io/library/node:20-alpine
 => [deps 1/4] FROM docker.io/library/node:20-alpine
 => [internal] load build context
 => [deps 2/4] WORKDIR /app
 => [deps 3/4] COPY package.json package-lock.json ./
 => [deps 4/4] RUN npm ci
 => [builder 1/4] COPY --from=deps /app/node_modules ./node_modules
 => [builder 2/4] COPY . .
 => [builder 3/4] RUN npm run build
 => [runner 1/4] WORKDIR /app
 => [runner 2/4] COPY --from=builder /app/public ./public
 => [runner 3/4] COPY --from=builder /app/.next/standalone ./
 => [runner 4/4] COPY --from=builder /app/.next/static ./.next/static
 => exporting to image
 => => writing image sha256:8f4c28c89139f4e24efab4591a20a4d2f8cf351
 => => naming to docker.io/library/custom-stellar-ide:latest
```

```bash
# Run and verify local container startup
docker run -d -p 3000:3000 --name test-ide custom-stellar-ide:latest
docker ps
```
*Output:*
```text
CONTAINER ID   IMAGE                      COMMAND                  CREATED         STATUS         PORTS                    NAMES
8d3c5e2d1a4b   custom-stellar-ide:latest  "node server.js"         2 seconds ago   Up 1 second    0.0.0.0:3000->3000/tcp   test-ide
```

### 4.3 Deployment Pre-Flight Checklist
- [ ] **Branding:** Replaced the logo at `ide/public/icon.png` and modified metadata in `manifest.json`.
- [ ] **PWA Assets:** Executed the icon generation script and verified `pwa-192x192.png` and `pwa-512x512.png` exist.
- [ ] **HTTPS Enforced:** Enabled redirect from HTTP to HTTPS (Required by all major browsers to register Service Workers).
- [ ] **NextAuth Configuration:** Confirmed `NEXTAUTH_URL` is set to the public canonical URL and `NEXTAUTH_SECRET` is defined.
- [ ] **CORS Settings:** Allowed origins matches the target production subdomain.
- [ ] **Offline Cache:** Loaded the app in Chrome, enabled offline mode in DevTools, and verified that page reloads without network access.
