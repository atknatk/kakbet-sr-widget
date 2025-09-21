import express from 'express';
import { ProxyService } from '../services/ProxyService.js';
import { logger } from '../utils/logger.js';

/**
 * Create proxy router with configuration
 */
export function createProxyRouter(config) {
  const router = express.Router();
  const proxyService = new ProxyService(config);

  // Main proxy endpoint: /proxy/{provider}/{widget-type}
  router.get('/:provider/:widgetType', async (req, res) => {
    const { provider, widgetType } = req.params;
    const queryParams = req.query;

    try {
      logger.info(`Proxy request: ${provider}/${widgetType}`, { 
        params: queryParams,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer')
      });

      const result = await proxyService.proxyWidget(provider, widgetType, queryParams, {
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        acceptEncoding: req.get('Accept-Encoding')
      });

      // Set appropriate headers
      res.set(result.headers);
      
      // Set content type based on response
      if (result.contentType) {
        res.type(result.contentType);
      }

      // Send response
      res.status(result.status).send(result.data);

    } catch (error) {
      logger.error(`Proxy error for ${provider}/${widgetType}:`, error);
      
      res.status(error.status || 500).json({
        error: 'Proxy Error',
        message: error.message,
        provider,
        widgetType
      });
    }
  });

  // Asset proxy endpoint: /proxy/{provider}/assets/{path}
  router.get('/:provider/assets/*', async (req, res) => {
    const { provider } = req.params;
    const assetPath = req.params[0]; // Everything after /assets/

    try {
      logger.info(`Asset proxy request: ${provider}/assets/${assetPath}`);

      const result = await proxyService.proxyAsset(provider, `/assets/${assetPath}`, {
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        acceptEncoding: req.get('Accept-Encoding')
      });

      // Set appropriate headers
      res.set(result.headers);
      
      // Set content type
      if (result.contentType) {
        res.type(result.contentType);
      }

      // Send response
      res.status(result.status).send(result.data);

    } catch (error) {
      logger.error(`Asset proxy error for ${provider}/assets/${assetPath}:`, error);
      
      res.status(error.status || 500).json({
        error: 'Asset Proxy Error',
        message: error.message,
        provider,
        assetPath
      });
    }
  });

  // Generic asset proxy for other paths (js, css, etc.)
  router.get('/:provider/:assetType/*', async (req, res) => {
    const { provider, assetType } = req.params;
    const assetPath = req.params[0];
    const fullPath = `/${assetType}/${assetPath}`;

    try {
      logger.info(`Generic asset proxy: ${provider}${fullPath}`);

      const result = await proxyService.proxyAsset(provider, fullPath, {
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        acceptEncoding: req.get('Accept-Encoding')
      });

      // Set headers
      res.set(result.headers);
      
      if (result.contentType) {
        res.type(result.contentType);
      }

      res.status(result.status).send(result.data);

    } catch (error) {
      logger.error(`Generic asset proxy error for ${provider}${fullPath}:`, error);
      
      res.status(error.status || 500).json({
        error: 'Asset Proxy Error',
        message: error.message,
        provider,
        path: fullPath
      });
    }
  });

  // Provider info endpoint
  router.get('/:provider', (req, res) => {
    const { provider } = req.params;
    const providerConfig = config.providers[provider];

    if (!providerConfig) {
      return res.status(404).json({
        error: 'Provider Not Found',
        message: `Provider '${provider}' is not configured`,
        availableProviders: Object.keys(config.providers)
      });
    }

    res.json({
      provider,
      name: providerConfig.name,
      baseUrl: providerConfig.baseUrl,
      widgetTypes: Object.keys(providerConfig.widgetTypes),
      cache: providerConfig.cache
    });
  });

  return router;
}
