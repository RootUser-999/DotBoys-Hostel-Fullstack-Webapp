import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { db, initSchema, seedInitialData, getSetting } from './server/db.ts';
import { publicRouter } from './server/routes/public.ts';
import { adminCoreRouter } from './server/routes/adminCore.ts';
import { adminOpsRouter } from './server/routes/adminOps.ts';
import {
  generateBillingCycleForMonth,
  refreshOverdueStatuses,
  releaseExpiredReservations,
} from './server/services/hostelLogic.ts';
import { getWhatsAppConfigStatus, runAutomatedWhatsAppReminders } from './server/whatsapp.ts';
import { getKarachiDateParts } from './src/lib/billing.ts';

process.env.TZ = 'Asia/Karachi';

initSchema();
seedInitialData();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve public media uploads (never serve private member documents folder publicly)
  const mediaDir = path.join(process.cwd(), 'uploads', 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  app.use('/uploads/media', express.static(mediaDir));

  // API routes
  app.use('/api/public', publicRouter);
  app.use('/api/admin', adminCoreRouter);
  app.use('/api/admin', adminOpsRouter);

  // Official WhatsApp Business Cloud API Webhook (verification + real delivery status updates)
  app.get('/api/webhooks/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'dotboys-webhook-verify';
    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  app.post('/api/webhooks/whatsapp', (req, res) => {
    try {
      const entries = (req.body?.entry || []) as Array<{
        changes?: Array<{
          value?: {
            statuses?: Array<{
              id: string;
              status: string;
              errors?: Array<{ title?: string; message?: string }>;
            }>;
          };
        }>;
      }>;
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          for (const st of change.value?.statuses || []) {
            const mapped =
              st.status === 'delivered'
                ? 'delivered'
                : st.status === 'read'
                ? 'read'
                : st.status === 'sent'
                ? 'sent'
                : st.status === 'failed'
                ? 'failed'
                : null;
            if (mapped && st.id) {
              const reason = st.errors?.[0]?.message || st.errors?.[0]?.title || null;
              db.prepare(
                'UPDATE whatsapp_messages SET delivery_status = ?, failure_reason = COALESCE(?, failure_reason) WHERE wa_message_id = ?'
              ).run(mapped, reason, st.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('WhatsApp webhook error:', err);
    }
    res.sendStatus(200);
  });

  // SEO endpoints
  app.get('/robots.txt', (_req, res) => {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\nSitemap: ${appUrl}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (_req, res) => {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const categories = db.prepare('SELECT slug FROM room_categories WHERE is_active = 1').all() as Array<{ slug: string }>;
    const staticRoutes = ['/', '/about', '/rooms', '/facilities', '/mess-menu', '/gallery', '/contact', '/book', '/legal'];
    const urls = [
      ...staticRoutes.map((r) => `${appUrl}${r}`),
      ...categories.map((c) => `${appUrl}/rooms/${c.slug}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  // API 404 guard
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite dev middleware or static dist build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Scheduled Asia/Karachi background automation (billing generation, reservation expiry, WhatsApp reminders)
  const runScheduledJobs = async () => {
    try {
      releaseExpiredReservations();
      const karachi = getKarachiDateParts();
      generateBillingCycleForMonth(karachi.billingMonth);
      refreshOverdueStatuses();
      if (getSetting('whatsapp_auto_enabled', '1') === '1' && getWhatsAppConfigStatus().configured) {
        await runAutomatedWhatsAppReminders();
      }
    } catch (err) {
      console.error('Background scheduler error:', err);
    }
  };

  setTimeout(() => void runScheduledJobs(), 3000);
  setInterval(() => void runScheduledJobs(), 15 * 60 * 1000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DOT BOYS HOSTEL server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
