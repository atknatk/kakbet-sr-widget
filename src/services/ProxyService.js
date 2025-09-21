import axios from 'axios';
import NodeCache from 'node-cache';
import { logger } from '../utils/logger.js';

/**
 * Proxy service for handling widget and asset requests
 */
export class ProxyService {
  constructor(config) {
    this.config = config;
    this.cache = new NodeCache({
      stdTTL: config.cache.defaultTtl,
      maxKeys: config.cache.maxKeys,
      checkperiod: config.cache.checkPeriod || 600
    });

    // Create axios instance with default config
    this.httpClient = axios.create({
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });

    logger.info('ProxyService initialized', {
      providers: Object.keys(config.providers),
      cacheConfig: config.cache
    });
  }

  /**
   * Proxy widget script requests
   */
  async proxyWidget(provider, widgetType, queryParams = {}, requestHeaders = {}) {
    const providerConfig = this.config.providers[provider];
    
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found`);
    }

    const widgetConfig = providerConfig.widgetTypes[widgetType];
    if (!widgetConfig) {
      throw new Error(`Widget type '${widgetType}' not found for provider '${provider}'`);
    }

    // Build target URL
    const widgetPath = widgetConfig.path.replace('{widgetId}', providerConfig.widgetId);
    const targetUrl = `${providerConfig.baseUrl}${widgetPath}`;

    // Create cache key
    const cacheKey = `widget:${provider}:${widgetType}:${JSON.stringify(queryParams)}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for ${cacheKey}`);
      return cached;
    }

    try {
      // Prepare request headers
      const headers = {
        ...providerConfig.headers,
        'User-Agent': requestHeaders.userAgent || providerConfig.headers['User-Agent'],
        'Referer': requestHeaders.referer || 'https://kakbet.com'
      };

      if (requestHeaders.acceptEncoding) {
        headers['Accept-Encoding'] = requestHeaders.acceptEncoding;
      }

      logger.info(`Fetching widget: ${targetUrl}`, { headers, queryParams });

      // Make request
      const response = await this.httpClient.get(targetUrl, {
        headers,
        params: queryParams,
        responseType: 'text'
      });

      // Prepare response
      const result = {
        status: response.status,
        data: response.data,
        contentType: response.headers['content-type'] || 'application/javascript',
        headers: this.buildResponseHeaders(response.headers, 'script')
      };

      // Cache the result
      const cacheTtl = providerConfig.cache?.scripts || this.config.cache.defaultTtl;
      this.cache.set(cacheKey, result, cacheTtl);

      logger.info(`Widget proxied successfully: ${provider}/${widgetType}`, {
        status: response.status,
        size: response.data?.length || 0,
        cached: cacheTtl
      });

      return result;

    } catch (error) {
      logger.error(`Failed to proxy widget ${provider}/${widgetType}:`, {
        error: error.message,
        url: targetUrl,
        status: error.response?.status
      });

      throw new Error(`Failed to fetch widget: ${error.message}`);
    }
  }

  /**
   * Proxy asset requests (JS, CSS, images, etc.)
   */
  async proxyAsset(provider, assetPath, requestHeaders = {}) {
    const providerConfig = this.config.providers[provider];
    
    if (!providerConfig) {
      throw new Error(`Provider '${provider}' not found`);
    }

    // Build target URL
    const targetUrl = `${providerConfig.baseUrl}${assetPath}`;

    // Create cache key
    const cacheKey = `asset:${provider}:${assetPath}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit for asset ${cacheKey}`);
      return cached;
    }

    try {
      // Prepare request headers
      const headers = {
        ...providerConfig.headers,
        'User-Agent': requestHeaders.userAgent || providerConfig.headers['User-Agent'],
        'Referer': requestHeaders.referer || 'https://kakbet.com'
      };

      if (requestHeaders.acceptEncoding) {
        headers['Accept-Encoding'] = requestHeaders.acceptEncoding;
      }

      logger.info(`Fetching asset: ${targetUrl}`);

      // Determine response type based on file extension
      const responseType = this.getResponseType(assetPath);

      // Make request
      const response = await this.httpClient.get(targetUrl, {
        headers,
        responseType
      });

      // Prepare response
      const result = {
        status: response.status,
        data: response.data,
        contentType: response.headers['content-type'] || this.getContentType(assetPath),
        headers: this.buildResponseHeaders(response.headers, 'asset')
      };

      // Cache the result
      const cacheTtl = this.getAssetCacheTtl(providerConfig, assetPath);
      this.cache.set(cacheKey, result, cacheTtl);

      logger.info(`Asset proxied successfully: ${assetPath}`, {
        status: response.status,
        size: response.data?.length || 0,
        cached: cacheTtl
      });

      return result;

    } catch (error) {
      logger.error(`Failed to proxy asset ${assetPath}:`, {
        error: error.message,
        url: targetUrl,
        status: error.response?.status
      });

      throw new Error(`Failed to fetch asset: ${error.message}`);
    }
  }

  /**
   * Build response headers for proxied content
   */
  buildResponseHeaders(originalHeaders, resourceType) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff'
    };

    // Preserve important headers
    if (originalHeaders['content-type']) {
      headers['Content-Type'] = originalHeaders['content-type'];
    }

    if (originalHeaders['content-encoding']) {
      headers['Content-Encoding'] = originalHeaders['content-encoding'];
    }

    if (originalHeaders['cache-control']) {
      headers['Cache-Control'] = originalHeaders['cache-control'];
    } else {
      // Set default cache control based on resource type
      headers['Cache-Control'] = resourceType === 'script' 
        ? 'public, max-age=300' 
        : 'public, max-age=3600';
    }

    return headers;
  }

  /**
   * Get appropriate response type for axios based on file extension
   */
  getResponseType(assetPath) {
    const ext = assetPath.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'js':
      case 'css':
      case 'html':
      case 'xml':
      case 'json':
        return 'text';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'ico':
        return 'arraybuffer';
      default:
        return 'text';
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(assetPath) {
    const ext = assetPath.split('.').pop()?.toLowerCase();
    
    const contentTypes = {
      'js': 'application/javascript',
      'css': 'text/css',
      'html': 'text/html',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'ico': 'image/x-icon',
      'svg': 'image/svg+xml'
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get cache TTL for different asset types
   */
  getAssetCacheTtl(providerConfig, assetPath) {
    const ext = assetPath.split('.').pop()?.toLowerCase();
    
    if (ext === 'js') {
      if (assetPath.includes('chunk.')) {
        return providerConfig.cache?.chunks || 1800; // 30 minutes for chunks
      }
      return providerConfig.cache?.assets || 3600; // 1 hour for other JS
    }
    
    if (ext === 'css') {
      return providerConfig.cache?.assets || 3600; // 1 hour for CSS
    }
    
    // Default for other assets
    return providerConfig.cache?.assets || 3600;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      stats: this.cache.getStats()
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.flushAll();
    logger.info('Cache cleared');
  }
}
