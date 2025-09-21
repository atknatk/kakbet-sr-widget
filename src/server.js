/**
 * SportRadar Widget Proxy Server - Enterprise Production Ready
 *
 * High-performance proxy server for SportRadar widgets with:
 * - Real-time asset proxying with header preservation
 * - Widget script URL rewriting for API redirection
 * - CORS and security headers for iframe embedding
 * - Health monitoring and logging
 * - Docker containerization support
 *
 * @version 1.0.0
 * @author KakBet Engineering Team
 */

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import url from 'url';
import zlib from 'zlib';

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

/**
 * Enterprise Logger with structured logging
 */
class Logger {
  static levels = { error: 0, warn: 1, info: 2, debug: 3 };

  static log(level, message, meta = {}) {
    if (Logger.levels[level] <= Logger.levels[LOG_LEVEL]) {
      const timestamp = new Date().toISOString();
      const logEntry = NODE_ENV === 'production'
        ? JSON.stringify({ timestamp, level, message, ...meta })
        : `[${timestamp}] ${level.toUpperCase()}: ${message}`;
      console.log(logEntry);
    }
  }

  static info(message, meta) { Logger.log('info', message, meta); }
  static warn(message, meta) { Logger.log('warn', message, meta); }
  static error(message, meta) { Logger.log('error', message, meta); }
  static debug(message, meta) { Logger.log('debug', message, meta); }
}

/**
 * Security and CORS headers for widget embedding
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/**
 * SportRadar Widget Configuration
 */
const config = {
  sportradar: {
    baseUrl: 'https://widgets.sir-sportradar.com',
    widgetId: '984c87dccac74331a2261fd032f80dbf',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    referer: 'https://www.tipx10.com/'
  }
};

/**
 * Enterprise-grade proxy request handler with dual-mode operation
 * @param {string} targetUrl - Target URL to proxy
 * @param {http.IncomingMessage} req - Incoming request
 * @param {http.ServerResponse} res - Server response
 * @param {Object} opts - Options for proxy behavior
 * @param {boolean} opts.rewriteWidgetScript - Enable widget script URL rewriting
 */
function proxyRequest(targetUrl, req, res, opts = {}) {
  const { rewriteWidgetScript = false } = opts;
  const startTime = Date.now();

  Logger.info('Proxy request initiated', {
    targetUrl,
    method: req.method,
    rewriteMode: rewriteWidgetScript
  });

  const targetUrlObj = new URL(targetUrl);
  const options = {
    hostname: targetUrlObj.hostname,
    port: targetUrlObj.port || (targetUrlObj.protocol === 'https:' ? 443 : 80),
    path: targetUrlObj.pathname + targetUrlObj.search,
    method: req.method,
    headers: {
      'User-Agent': config.sportradar.userAgent,
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': config.sportradar.referer
    }
  };

  const client = targetUrlObj.protocol === 'https:' ? https : http;

  const proxyReq = client.request(options, (proxyRes) => {
    const duration = Date.now() - startTime;
    Logger.info('Proxy response received', {
      statusCode: proxyRes.statusCode,
      targetUrl,
      duration: `${duration}ms`
    });

    // Always set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    const upstreamHeaders = proxyRes.headers;

    if (!rewriteWidgetScript) {
      // Stream mode: forward headers and body as-is (preserve content-length, cache-control, encoding)
      for (const [key, value] of Object.entries(upstreamHeaders)) {
        try { if (value !== undefined) res.setHeader(key, value); } catch {}
      }
      res.writeHead(proxyRes.statusCode);

      // Pipe response directly
      proxyRes.pipe(res);
      return;
    }

    // Transform mode (widget loader only): collect, (de)compress, rewrite, send
    const contentEncoding = upstreamHeaders['content-encoding'];

    let data = Buffer.alloc(0);
    proxyRes.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });

    proxyRes.on('end', () => {
      let finalData = data;

      // Decompress if needed
      try {
        if (contentEncoding === 'gzip') finalData = zlib.gunzipSync(data);
        else if (contentEncoding === 'br') finalData = zlib.brotliDecompressSync(data);
        else if (contentEncoding === 'deflate') finalData = zlib.inflateSync(data);
      } catch (err) {
        console.error('Decompression error:', err.message);
        finalData = data; // fallback
      }

      // Replace URLs in widget script
      let responseText = finalData.toString();

      responseText = responseText.replace(
        /"lmtFishnetFeedsUrl":"https:\/\/lt-fn\.sir-sportradar\.com"/g,
        `"lmtFishnetFeedsUrl":"http://localhost:3001/api/lt-fn"`
      );

      responseText = responseText.replace(
        /"cardsFishnetFeedsUrl":"https:\/\/ws-fn\.sir-sportradar\.com"/g,
        `"cardsFishnetFeedsUrl":"http://localhost:3001/api/ws-fn"`
      );

      responseText = responseText.replace(
        /https:\/\/lt-fn\.sir-sportradar\.com/g,
        'http://localhost:3001/api/lt-fn'
      );

      responseText = responseText.replace(
        /https:\/\/ws-fn\.sir-sportradar\.com/g,
        'http://localhost:3001/api/ws-fn'
      );

      // Set headers for transformed response
      res.setHeader('Content-Type', upstreamHeaders['content-type'] || 'application/javascript');
      if (upstreamHeaders['cache-control']) {
        res.setHeader('Cache-Control', upstreamHeaders['cache-control']);
      }
      const buf = Buffer.from(responseText, 'utf8');
      res.setHeader('Content-Length', String(buf.length));
      // Do not set content-encoding after transform

      res.writeHead(proxyRes.statusCode);
      res.end(buf);
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`❌ Proxy error: ${err.message}`);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`📥 ${req.method} ${pathname}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      cache: 'disabled'
    }));
    return;
  }

  // Demo page
  if (pathname === '/' || pathname === '/demo') {
    try {
      const demoPath = path.join(process.cwd(), 'demo.html');
      const demoContent = fs.readFileSync(demoPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html', ...corsHeaders });
      res.end(demoContent);
      return;
    } catch (error) {
      console.error('Demo file not found:', error.message);
    }
  }


  // Loader preview assets from docs/widget/loader
  if (pathname === '/loader/theme.css') {
    try {
      // Docker: /app/docs/widget/loader/theme.css, Local: ../../docs/widget/loader/theme.css
      const cssPath = fs.existsSync(path.join(process.cwd(), 'docs', 'widget', 'loader', 'theme.css'))
        ? path.join(process.cwd(), 'docs', 'widget', 'loader', 'theme.css')
        : path.join(process.cwd(), '..', '..', 'docs', 'widget', 'loader', 'theme.css');
      const css = fs.readFileSync(cssPath);
      res.writeHead(200, { 'Content-Type': 'text/css', ...corsHeaders, 'Content-Length': String(css.length) });
      res.end(css);
      return;
    } catch (err) {
      console.error('Failed to read theme.css:', err.message);
    }
  }

  if (pathname === '/loader/preview.html' || pathname === '/loader/preview') {
    try {
      // Docker: /app/docs/widget/loader/preview.html, Local: ../../docs/widget/loader/preview.html
      const htmlPath = fs.existsSync(path.join(process.cwd(),  'widget', 'preview.html'))
        ? path.join(process.cwd(), 'widget', 'preview.html')
        : path.join(process.cwd(), '..', '..', 'docs', 'widget', 'loader', 'preview.html');
      let html = fs.readFileSync(htmlPath, 'utf8');
      console.log('HTML:', htmlPath);
      const matchId = (parsedUrl.query && parsedUrl.query.matchId) ? String(parsedUrl.query.matchId) : '61939220';
      // Ensure the widget loader script goes through our proxy for proper referer/cors handling
      html = html.replace(/https:\/\/widgets\.sir\.sportradar\.com\/[^/]+\/widgetloader/g,
        `http://localhost:3001/proxy/sportradar/match.lmtPlus?matchId=${matchId}`);
      // Also override the matchId used inside the inline SIR addWidget config
      html = html.replace(/matchId\s*:\s*\d+/g, `matchId:${matchId}`);
      res.writeHead(200, { 'Content-Type': 'text/html', ...corsHeaders });
      res.end(html);
      return;
    } catch (err) {
      console.error('Failed to read preview.html:', err.message);
    }
  }


  // API endpoint
  if (pathname === '/api') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders });
    res.end(JSON.stringify({
      name: 'Widget Proxy',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        demo: '/',
        widget: '/proxy/sportradar/match.lmtPlus?matchId=123',
        assets: '/proxy/sportradar/assets/js/chunk.123.js',
        health: '/health'
      }
    }));
    return;
  }

  // Widget proxy: /proxy/sportradar/match.lmtPlus
  if (pathname.startsWith('/proxy/sportradar/match.')) {
    const widgetType = pathname.split('/').pop(); // e.g., 'lmtPlus'
    const queryString = parsedUrl.search || '';
    const targetUrl = `${config.sportradar.baseUrl}/${config.sportradar.widgetId}/widgetloader${queryString}`;

    Logger.info('Widget proxy request', { widgetType, targetUrl });
    proxyRequest(targetUrl, req, res, { rewriteWidgetScript: true });
    return;
  }

  // SportRadar licensing endpoint
  if (pathname === `/${config.sportradar.widgetId}/licensing`) {
    const targetUrl = `${config.sportradar.baseUrl}${pathname}`;
    Logger.debug('Licensing request', { targetUrl });
    proxyRequest(targetUrl, req, res);
    return;
  }

  // SportRadar translations
  if (pathname.startsWith('/translations/')) {
    const targetUrl = `${config.sportradar.baseUrl}${pathname}`;
    Logger.debug('Translation request', { pathname, targetUrl });
    proxyRequest(targetUrl, req, res);
    return;
  }

  // SportRadar API proxies - ws-fn.sir-sportradar.com and lt-fn.sir-sportradar.com
  if (pathname.startsWith('/api/ws-fn/') || pathname.startsWith('/api/lt-fn/')) {
    const apiType = pathname.startsWith('/api/ws-fn/') ? 'ws-fn' : 'lt-fn';
    const apiPath = pathname.replace(`/api/${apiType}/`, '');
    const queryString = parsedUrl.search || '';
    const targetUrl = `https://${apiType}.sir-sportradar.com/${apiPath}${queryString}`;
    proxyRequest(targetUrl, req, res);
    return;
  }

  // Asset proxy: /proxy/sportradar/assets/* or /proxy/sportradar/js/*
  if (pathname.startsWith('/proxy/sportradar/')) {
    const assetPath = pathname.replace('/proxy/sportradar', '');
    const targetUrl = `${SPORTRADAR_BASE}${assetPath}`;
    proxyRequest(targetUrl, req, res);
    return;
  }

  // Asset proxy for direct paths: /assets/*, /js/*, /css/* (streaming mode)
  if (pathname.startsWith('/assets/') || pathname.startsWith('/js/') || pathname.startsWith('/css/')) {
    const targetUrl = `${config.sportradar.baseUrl}${pathname}`;
    Logger.debug('Direct asset request', { pathname, targetUrl });
    proxyRequest(targetUrl, req, res); // Streaming mode preserves headers
    return;
  }

  // 404 - Route not found
  Logger.warn('Route not found', { method: req.method, pathname, userAgent: req.headers['user-agent'] });
  res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders });
  res.end(JSON.stringify({
    error: 'Not Found',
    message: `Route ${req.method} ${pathname} not found`,
    timestamp: new Date().toISOString()
  }));
});

/**
 * Start the enterprise proxy server
 */
server.listen(PORT, '0.0.0.0', () => {
  Logger.info('KakBet Widget Proxy Server started', {
    port: PORT,
    environment: NODE_ENV,
    logLevel: LOG_LEVEL,
    sportradarBase: config.sportradar.baseUrl,
    widgetId: config.sportradar.widgetId
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    process.exit(0);
  });
});
