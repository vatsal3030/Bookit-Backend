import { Request, Response, NextFunction } from 'express';

/**
 * Recursive XSS sanitizer — strips dangerous HTML/script patterns from
 * all string values in req.body, req.query, and req.params.
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    return value
      // Strip <script>...</script> tags and their contents
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Strip on* event handlers e.g. onerror=, onclick=
      .replace(/\bon\w+\s*=\s*["']?[^"'>]*["']?/gi, '')
      // Strip javascript: protocol in attributes
      .replace(/javascript\s*:/gi, '')
      // Strip data: URIs that could execute code
      .replace(/data\s*:\s*text\/html/gi, '')
      // Strip standalone HTML tags (img, iframe, object, embed, link, style)
      .replace(/<\s*(script|iframe|object|embed|link|style)[^>]*>/gi, '')
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }
  return value;
}

export const xssSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body) req.body = sanitizeValue(req.body);
  // Note: req.query is read-only in Express 5, and req.params is set by router.
  // Only sanitize req.body which contains user-submitted data.
  next();
};

/**
 * Blocks requests with suspicious SQL injection patterns inside query strings.
 * Not a full WAF, but catches the most common automated bot attacks.
 */
export const sqlInjectionGuard = (req: Request, res: Response, next: NextFunction) => {
  const suspicious = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b.*\b(FROM|INTO|TABLE|SET|WHERE|DATABASE)\b)|(-{2})|(\bOR\b\s+\d+\s*=\s*\d+)/i;
  
  const rawUrl = req.originalUrl || req.url;
  if (suspicious.test(decodeURIComponent(rawUrl))) {
    return res.status(403).json({ success: false, error: 'Forbidden: Malicious input detected' });
  }
  next();
};

/**
 * Adds standard security response headers beyond what Helmet provides.
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // Prevent browsers from MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Block page from being loaded in an iframe (clickjacking protection)
  res.setHeader('X-Frame-Options', 'DENY');
  // Enable XSS filter in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Don't send the Referer header for cross-origin requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Restrict browser features/APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
};
