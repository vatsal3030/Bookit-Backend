import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bookit.vixora.co.in';

router.get('/sitemap.xml', async (req, res) => {
  try {
    const providers = await prisma.serviceProvider.findMany({
      where: {
        user: { isVerified: true },
        services: { some: { isActive: true } }
      },
      select: { id: true, updatedAt: true }
    });

    const staticRoutes = [
      { url: '/', priority: 1.0, changefreq: 'daily' },
      { url: '/search', priority: 0.9, changefreq: 'hourly' },
      { url: '/login', priority: 0.5, changefreq: 'monthly' },
      { url: '/register', priority: 0.5, changefreq: 'monthly' }
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Core Static Routes
    for (const route of staticRoutes) {
      xml += `
  <url>
    <loc>${FRONTEND_URL}${route.url}</loc>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
    }

    // Dynamic Provider Profiles
    for (const provider of providers) {
      xml += `
  <url>
    <loc>${FRONTEND_URL}/providers/${provider.id}</loc>
    <lastmod>${provider.updatedAt.toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    xml += `\n</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Sitemap generation error:', err);
    res.status(500).end();
  }
});

export default router;
