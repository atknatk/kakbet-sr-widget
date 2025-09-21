# Use official Node.js runtime as base image
# Support multi-platform builds (linux/amd64, linux/arm64)
FROM --platform=$BUILDPLATFORM node:18-alpine

# Set working directory
WORKDIR /app

# Note: This server uses only Node.js built-in modules (no external dependencies)
# Copy package.json for metadata only
COPY apps/widget/package*.json ./

# Copy application code (includes local docs copy)
COPY apps/widget/ .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S widget -u 1001

# Change ownership of the app directory
RUN chown -R widget:nodejs /app
USER widget

# Expose port (configurable via PORT env var, defaults to 8001)
EXPOSE 8001
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "src/server.js"]
