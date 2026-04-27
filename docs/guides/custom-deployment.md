# Guide: Building and Deploying PWA Version

This guide covers how to customize, build, and deploy a white-labeled instance of the Stellar Suite IDE as a Progressive Web App (PWA).

## Customization (White-Labeling)

### Branding Assets
To customize the branding of your IDE instance:
1. Replace `ide/public/icon.png` with your own logo (minimum 512x512 recommended).
2. Update the application name in `ide/public/manifest.json` (if present) or within the `next.config.ts` PWA settings.

### Generating PWA Icons
The IDE includes a script to automatically generate the required PWA icon sizes:
```bash
cd ide
node generate-pwa-icons.mjs
```
This script uses `sharp` to create `pwa-192x192.png` and `pwa-512x512.png` from your `icon.png`.

---

## Environment Configuration

Create a `.env.local` file in the `ide` directory with the following variables:

```env
# AI Features
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini

# Authentication (for Cloud Sync)
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=https://your-domain.com

# Persistence (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Security
ALLOWED_ORIGINS=https://your-domain.com
```

---

## Deployment Options

### Vercel (Recommended)
The Stellar Suite IDE is built with Next.js and is optimized for Vercel.
1. Connect your GitHub repository to Vercel.
2. Set the **Root Directory** to `ide`.
3. Add the environment variables listed above.
4. Deploy.

### Docker
For self-hosting, use the provided `Dockerfile` in the `ide` directory.

1. Build the image:
   ```bash
   docker build -t stellar-suite-ide ./ide
   ```
2. Run the container:
   ```bash
   docker run -p 3000:3000 --env-file .env stellar-suite-ide
   ```

---

## PWA Setup

To enable PWA features in production:
1. Run `node setup-pwa.mjs` to install necessary dependencies and prepare the icons.
2. Ensure your deployment is served over **HTTPS** (required for Service Workers).
3. Verify the PWA installation by clicking the "Install" icon in the browser address bar.

## Deployment Checklist
- [ ] Environment variables configured for production.
- [ ] Branding assets updated and icons generated.
- [ ] SSL certificate active (HTTPS).
- [ ] `ALLOWED_ORIGINS` includes the production domain.
- [ ] Service worker is registered and functioning offline.
