#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="ghcr.io/kingkill85/snap-flow"
VERSION="latest"

# Logging functions
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command_exists npm; then
        log_error "npm is not installed. Please install Node.js first."
        exit 1
    fi
    
    if ! command_exists git; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Generate JWT_SECRET
generate_jwt_secret() {
    log_info "Generating JWT_SECRET..."
    JWT_SECRET=$(openssl rand -base64 32)
    log_success "JWT_SECRET generated"
}

# Create production .env file
create_env_file() {
    log_info "Creating production .env file..."
    
    cat > .env.production << EOF
# SnapFlow Production Environment Variables
NODE_ENV=production
PORT=8000
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=./data/database.sqlite
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost
EOF
    
    log_success ".env.production created"
}

# Build frontend
build_frontend() {
    log_info "Building frontend..."
    
    cd frontend
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi
    
    log_info "Running production build..."
    npm run build
    
    cd ..
    log_success "Frontend built successfully"
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image..."
    
    docker build -t ${IMAGE_NAME}:${VERSION} .
    
    log_success "Docker image built: ${IMAGE_NAME}:${VERSION}"
}

# Push to GitHub Container Registry
push_to_registry() {
    log_info "Pushing to GitHub Container Registry..."
    
    # Check if user is logged in to ghcr.io
    if ! docker pull ${IMAGE_NAME}:${VERSION} >/dev/null 2>&1; then
        log_warning "You may need to login to GitHub Container Registry"
        log_info "Run: echo \$GITHUB_TOKEN | docker login ghcr.io -u kingkill85 --password-stdin"
        log_info "Or: docker login ghcr.io -u kingkill85"
    fi
    
    docker push ${IMAGE_NAME}:${VERSION}
    log_success "Image pushed to ${IMAGE_NAME}:${VERSION}"
}

# Git operations
git_operations() {
    log_info "Preparing git commit..."
    
    # Check if there are changes to commit
    if [ -z "$(git status --porcelain)" ]; then
        log_warning "No changes to commit"
        return
    fi
    
    # Add all changes
    git add -A
    
    # Create commit with timestamp
    COMMIT_MSG="Docker deployment $(date '+%Y-%m-%d %H:%M:%S')"
    git commit -m "$COMMIT_MSG"
    
    log_success "Changes committed: $COMMIT_MSG"
    
    # Push to origin
    log_info "Pushing to GitHub..."
    git push origin main
    log_success "Code pushed to GitHub"
}

# Main deployment function
main() {
    echo -e "${GREEN}=================================${NC}"
    echo -e "${GREEN}  SnapFlow Docker Deployment${NC}"
    echo -e "${GREEN}=================================${NC}"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Generate secrets
    generate_jwt_secret
    
    # Create environment file
    create_env_file
    
    # Build frontend
    build_frontend
    
    # Build Docker image
    build_docker_image
    
    # Push to registry
    push_to_registry
    
    # Git operations
    git_operations
    
    echo ""
    echo -e "${GREEN}=================================${NC}"
    echo -e "${GREEN}  Deployment Complete!${NC}"
    echo -e "${GREEN}=================================${NC}"
    echo ""
    echo -e "Image: ${BLUE}${IMAGE_NAME}:${VERSION}${NC}"
    echo -e "JWT_SECRET: ${BLUE}${JWT_SECRET}${NC}"
    echo ""
    echo "To run the container:"
    echo -e "  ${YELLOW}docker run -d -p 80:8000 -v snapflow_data:/app/backend/data -v snapflow_uploads:/app/backend/uploads ${IMAGE_NAME}:${VERSION}${NC}"
    echo ""
    echo "Or use docker-compose:"
    echo -e "  ${YELLOW}docker-compose up -d${NC}"
}

# Run main function
main "$@"
