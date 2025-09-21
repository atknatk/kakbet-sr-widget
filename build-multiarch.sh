#!/bin/bash

# Multi-architecture Docker build script
# Builds for both AMD64 and ARM64 platforms

set -e

# Configuration
ECR_REGISTRY="827604626727.dkr.ecr.eu-central-1.amazonaws.com"
ECR_REPOSITORY="kakbet/sr-widget-proxy"
AWS_REGION="eu-central-1"
CONTAINER_NAME="sr-widget-proxy"

# Get version
VERSION=${1:-$(cat version.txt 2>/dev/null || echo "latest")}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info "Building multi-architecture Docker image..."
log_info "Version: $VERSION"

# Create and use buildx builder
log_info "Setting up Docker buildx..."
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder

# Build and push multi-arch image directly to registry
log_info "Building for linux/amd64,linux/arm64 and pushing to ECR..."

# AWS ECR Login
log_info "Logging into AWS ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

cd ../..

# Build and push multi-arch image
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/widget/Dockerfile \
  -t $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION \
  -t $ECR_REGISTRY/$ECR_REPOSITORY:latest \
  --push \
  .

cd apps/widget

log_success "Multi-architecture image built and pushed successfully!"
echo ""
echo "📦 Image: $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION"
echo "🏗️  Platforms: linux/amd64, linux/arm64"
echo "🌍 Region: $AWS_REGION"
echo ""
log_info "To deploy to K8s:"
echo "kubectl set image deployment/kakbet-widget-proxy widget-proxy=$ECR_REGISTRY/$ECR_REPOSITORY:$VERSION"
