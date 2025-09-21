#!/bin/bash

# SportRadar Widget Proxy - Build and Deploy Script
# Usage: ./build-and-deploy.sh [version]

set -e

# Configuration
ECR_REGISTRY="827604626727.dkr.ecr.eu-central-1.amazonaws.com"
ECR_REPOSITORY="kakbet/sr-widget-proxy"
AWS_REGION="eu-central-1"
CONTAINER_NAME="sr-widget-proxy"
TEST_PORT="8001"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get version
if [ -n "$1" ]; then
    VERSION="$1"
    echo "$VERSION" > version.txt
    log_info "Version set to: $VERSION"
else
    if [ -f version.txt ]; then
        VERSION=$(cat version.txt)
        log_info "Using version from version.txt: $VERSION"
    else
        VERSION="1.0.0"
        echo "$VERSION" > version.txt
        log_info "Created version.txt with default version: $VERSION"
    fi
fi

# Validate version format
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_error "Invalid version format. Use semantic versioning (e.g., 1.0.0)"
    exit 1
fi

# Build Docker image (docs copied locally)
log_info "Building Docker image for linux/amd64 platform..."
cd ../..

# Enable Docker buildx for multi-platform builds
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder

# Build for linux/amd64 (most K8s clusters)
docker buildx build \
  --platform linux/amd64 \
  -f apps/widget/Dockerfile \
  -t $CONTAINER_NAME:$VERSION \
  -t $CONTAINER_NAME:latest \
  --load \
  .

cd apps/widget

if [ $? -eq 0 ]; then
    log_success "Docker image built successfully"
else
    log_error "Docker build failed"
    exit 1
fi

# Test Docker container
log_info "Testing Docker container..."

# Stop any existing test container
docker stop ${CONTAINER_NAME}-test 2>/dev/null || true
docker rm ${CONTAINER_NAME}-test 2>/dev/null || true

# Start test container
log_info "Starting test container on port $TEST_PORT..."
docker run -d --name ${CONTAINER_NAME}-test -p $TEST_PORT:8001 $CONTAINER_NAME:$VERSION

# Wait for container to start
sleep 5

# Test health endpoint
log_info "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$TEST_PORT/health || echo "000")

if [ "$HEALTH_RESPONSE" = "200" ]; then
    log_success "Health check passed (HTTP $HEALTH_RESPONSE)"
else
    log_error "Health check failed (HTTP $HEALTH_RESPONSE)"
    docker logs ${CONTAINER_NAME}-test
    docker stop ${CONTAINER_NAME}-test
    docker rm ${CONTAINER_NAME}-test
    exit 1
fi

# Test demo page
log_info "Testing demo page..."
DEMO_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$TEST_PORT/ || echo "000")

if [ "$DEMO_RESPONSE" = "200" ]; then
    log_success "Demo page test passed (HTTP $DEMO_RESPONSE)"
else
    log_warning "Demo page test failed (HTTP $DEMO_RESPONSE)"
fi

# Test loader preview
log_info "Testing loader preview..."
LOADER_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$TEST_PORT/loader/preview.html || echo "000")

if [ "$LOADER_RESPONSE" = "200" ]; then
    log_success "Loader preview test passed (HTTP $LOADER_RESPONSE)"
else
    log_warning "Loader preview test failed (HTTP $LOADER_RESPONSE)"
fi

# Show container logs (last 10 lines)
log_info "Container logs (last 10 lines):"
docker logs --tail 10 ${CONTAINER_NAME}-test

# Stop test container
log_info "Stopping test container..."
docker stop ${CONTAINER_NAME}-test
docker rm ${CONTAINER_NAME}-test

log_success "Docker container tests completed successfully!"

# AWS ECR Login
log_info "Logging into AWS ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

if [ $? -eq 0 ]; then
    log_success "AWS ECR login successful"
else
    log_error "AWS ECR login failed"
    exit 1
fi

# Verify image platform before tagging
log_info "Verifying image platform..."
PLATFORM_INFO=$(docker inspect $CONTAINER_NAME:$VERSION --format='{{.Architecture}}/{{.Os}}')
log_info "Image platform: $PLATFORM_INFO"

if [[ "$PLATFORM_INFO" != "amd64/linux" ]]; then
    log_warning "Image platform is $PLATFORM_INFO, expected amd64/linux"
    log_info "This may cause issues in AMD64 Kubernetes clusters"
fi

# Tag images for ECR
log_info "Tagging images for ECR..."
docker tag $CONTAINER_NAME:$VERSION $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION
docker tag $CONTAINER_NAME:latest $ECR_REGISTRY/$ECR_REPOSITORY:latest

# Push to ECR
log_info "Pushing images to ECR..."
docker push $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION
docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

if [ $? -eq 0 ]; then
    log_success "Images pushed to ECR successfully!"
else
    log_error "Failed to push images to ECR"
    exit 1
fi

# Summary
echo ""
log_success "🎉 Deployment completed successfully!"
echo ""
echo "📦 Image: $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION"
echo "🏷️  Tags: $VERSION, latest"
echo "🌍 Region: $AWS_REGION"
echo "📝 Version file: version.txt"
echo ""
log_info "To deploy to ECS/EKS, use: $ECR_REGISTRY/$ECR_REPOSITORY:$VERSION"
echo ""
log_info "🔧 Kubernetes Deployment Commands:"
echo "kubectl set image deployment/kakbet-widget-proxy widget-proxy=$ECR_REGISTRY/$ECR_REPOSITORY:$VERSION"
echo "kubectl rollout restart deployment/kakbet-widget-proxy"
echo "kubectl rollout status deployment/kakbet-widget-proxy"
