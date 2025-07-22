# CI/CD Pipeline Setup for Parallel AI System

This document provides a comprehensive guide to the CI/CD pipeline implementation for the Parallel AI System, featuring automated testing, security scanning, multi-environment deployment, and comprehensive monitoring.

## 🏗️ Architecture Overview

The CI/CD pipeline is built with GitHub Actions and includes:

- **Continuous Integration**: Automated testing, linting, security scanning
- **Continuous Deployment**: Multi-environment deployment with blue-green strategy
- **Monitoring**: Real-time system monitoring with Prometheus and Grafana
- **Security**: Comprehensive security scanning and compliance checks
- **Performance**: Automated performance testing and optimization

## 📋 Pipeline Components

### 1. GitHub Actions Workflows

#### CI Pipeline (`.github/workflows/ci.yml`)
- **Code Quality Checks**: ESLint, Prettier, Python Black, Flake8, PyLint, MyPy
- **Security Scanning**: Trivy, CodeQL, Snyk vulnerability scanning
- **Unit Tests**: Frontend (Jest), Backend (pytest), with coverage reporting
- **Integration Tests**: Full system integration testing with Redis and PostgreSQL
- **Docker Build Tests**: Multi-service Docker image building and testing
- **Performance Tests**: K6 performance testing with threshold validation

#### CD Pipeline (`.github/workflows/cd.yml`)
- **Image Building**: Multi-architecture Docker images with SBOM generation
- **Security Validation**: Container image vulnerability scanning
- **Staging Deployment**: Automated staging environment deployment
- **End-to-End Testing**: Playwright E2E tests against staging
- **Production Deployment**: Blue-green deployment strategy with health checks
- **Rollback Capability**: Automatic rollback on deployment failures

#### Monitoring Pipeline (`.github/workflows/monitoring.yml`)
- **Health Checks**: Continuous system health monitoring
- **Performance Monitoring**: Resource usage and performance metrics
- **Cost Analysis**: AWS cost monitoring and alerting
- **Backup Verification**: Automated backup validation

### 2. Build and Test Scripts

#### Build Script (`scripts/build.sh`)
- **Multi-Service Building**: Supports all system services
- **Environment Targeting**: Development, staging, production builds
- **Image Optimization**: Layer optimization and vulnerability scanning
- **Artifact Generation**: SBOM, build summaries, and metadata
- **Cleanup**: Automatic cleanup of old images and build cache

#### Test Script (`scripts/test.sh`)
- **Comprehensive Testing**: Unit, integration, E2E, performance, security tests
- **Coverage Reporting**: Detailed coverage analysis with thresholds
- **Parallel Execution**: Optimized test execution with parallel processing
- **Test Environment**: Automated test environment setup and teardown
- **Reporting**: HTML dashboards and test summaries

#### Performance Tests
- **Load Testing** (`scripts/performance/load-test.js`): Gradual load increase testing
- **Stress Testing** (`scripts/performance/stress-test.js`): System limit testing
- **Metrics Collection**: Response times, throughput, error rates
- **Threshold Validation**: Automated pass/fail criteria

### 3. Deployment Configuration

#### Kubernetes Manifests (`deploy/kubernetes/`)
- **Namespaces**: Environment isolation
- **Resource Quotas**: Environment-specific resource limits
- **Network Policies**: Security and traffic isolation
- **RBAC**: Role-based access control

#### Helm Charts (`deploy/helm/parallel-ai/`)
- **Modular Configuration**: Service-specific configurations
- **Environment Values**: Staging and production value files
- **Dependency Management**: Redis, PostgreSQL, monitoring dependencies
- **Auto-scaling**: HPA configuration for dynamic scaling

#### Deployment Script (`scripts/deploy.sh`)
- **Environment Validation**: Pre-deployment checks and validation
- **Blue-Green Deployment**: Zero-downtime production deployments
- **Health Checks**: Comprehensive deployment health validation
- **Rollback Capability**: Automatic and manual rollback options
- **Notifications**: Slack integration for deployment status

### 4. Monitoring and Alerting

#### Prometheus Configuration (`monitoring/prometheus-config.yml`)
- **Service Discovery**: Kubernetes service discovery
- **Metrics Collection**: Application and infrastructure metrics
- **Recording Rules**: Pre-computed metrics for performance
- **Retention Policy**: 30-day metric retention

#### Alert Rules (`monitoring/alert-rules.yml`)
- **System Health**: Service availability and health checks
- **Performance**: Response time and throughput alerts
- **Resource Usage**: CPU, memory, disk utilization alerts
- **Business Logic**: AI agent performance and queue monitoring
- **Security**: Unauthorized access and suspicious activity alerts

#### Grafana Dashboard (`monitoring/grafana-dashboard.json`)
- **System Overview**: High-level system metrics
- **Performance Metrics**: Request rates, response times, error rates
- **Resource Monitoring**: CPU, memory, storage utilization
- **AI Agent Performance**: Agent-specific performance metrics
- **Database Statistics**: Connection pools and query performance

## 🚀 Getting Started

### Prerequisites

1. **GitHub Repository**: Configured with appropriate secrets
2. **AWS Account**: EKS clusters for staging and production
3. **Container Registry**: GitHub Container Registry (GHCR)
4. **Monitoring Tools**: Prometheus and Grafana setup

### Required Secrets

Configure the following secrets in your GitHub repository:

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
EKS_CLUSTER_NAME_STAGING
EKS_CLUSTER_NAME_PRODUCTION

# Container Registry
GITHUB_TOKEN  # Automatic, for GHCR

# Monitoring and Notifications
SLACK_WEBHOOK_URL
GRAFANA_API_URL
GRAFANA_TOKEN
SNYK_TOKEN

# Application Secrets
DATABASE_PASSWORD
REDIS_PASSWORD
JWT_SECRET
```

### Initial Setup

1. **Configure AWS Infrastructure**:
   ```bash
   # Create EKS clusters
   aws eks create-cluster --name parallel-ai-staging --region us-west-2
   aws eks create-cluster --name parallel-ai-production --region us-west-2
   ```

2. **Install Dependencies**:
   ```bash
   # Install Helm
   curl https://get.helm.sh/helm-v3.13.0-linux-amd64.tar.gz | tar xz
   sudo mv linux-amd64/helm /usr/local/bin/

   # Add required Helm repositories
   helm repo add bitnami https://charts.bitnami.com/bitnami
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo add grafana https://grafana.github.io/helm-charts
   ```

3. **Deploy Monitoring Stack**:
   ```bash
   # Install Prometheus and Grafana
   helm install prometheus prometheus-community/kube-prometheus-stack \
     --namespace monitoring --create-namespace \
     --values monitoring/prometheus-values.yaml

   helm install grafana grafana/grafana \
     --namespace monitoring \
     --values monitoring/grafana-values.yaml
   ```

## 🔧 Pipeline Usage

### Manual Deployment

Deploy to staging:
```bash
./scripts/deploy.sh staging
```

Deploy to production:
```bash
./scripts/deploy.sh production
```

Dry run deployment:
```bash
DRY_RUN=true ./scripts/deploy.sh production
```

### Running Tests Locally

Run all tests:
```bash
./scripts/test.sh all
```

Run specific test suite:
```bash
./scripts/test.sh unit frontend
./scripts/test.sh integration api
./scripts/test.sh e2e
./scripts/test.sh performance
```

### Building Images

Build all services for production:
```bash
./scripts/build.sh all production
```

Build specific service for staging:
```bash
./scripts/build.sh api-service staging
```

## 📊 Monitoring and Alerting

### Accessing Dashboards

1. **Grafana Dashboard**: `https://grafana.parallel-ai.com`
   - Username: `admin`
   - Password: Retrieved from Kubernetes secret

2. **Prometheus**: `https://prometheus.parallel-ai.com`
   - Metrics exploration and query interface

### Key Metrics to Monitor

- **Request Rate**: Requests per second by service
- **Response Time**: 95th percentile latency
- **Error Rate**: Error percentage by service
- **Resource Usage**: CPU, memory, disk utilization
- **Queue Length**: Task queue backlog
- **AI Agent Performance**: Processing times and failure rates

### Alert Channels

- **Slack**: `#alerts` channel for critical issues
- **PagerDuty**: Production critical alerts
- **Email**: Development team notifications

## 🛡️ Security Features

### Container Security
- **Base Image Scanning**: Trivy vulnerability scanning
- **SBOM Generation**: Software Bill of Materials for compliance
- **Multi-stage Builds**: Minimal runtime images
- **Non-root Execution**: Security-hardened containers

### Network Security
- **Network Policies**: Kubernetes network isolation
- **TLS Everywhere**: End-to-end encryption
- **RBAC**: Role-based access control
- **Secret Management**: Kubernetes secrets and sealed secrets

### Compliance
- **CodeQL Analysis**: Automated code security analysis
- **Dependency Scanning**: Vulnerability scanning for dependencies
- **SAST/DAST**: Static and dynamic application security testing
- **Audit Logging**: Comprehensive audit trail

## 🔄 Rollback Procedures

### Automatic Rollback
The pipeline includes automatic rollback triggers:
- Health check failures after deployment
- Error rate exceeding 5% for 2 minutes
- Response time exceeding SLA thresholds

### Manual Rollback

Rollback via Helm:
```bash
# List available releases
helm list -n parallel-ai-system

# Rollback to previous version
helm rollback parallel-ai -n parallel-ai-system

# Rollback to specific revision
helm rollback parallel-ai 3 -n parallel-ai-system
```

Rollback via kubectl:
```bash
# Rollback deployment
kubectl rollout undo deployment/api-service -n parallel-ai-system

# Check rollback status
kubectl rollout status deployment/api-service -n parallel-ai-system
```

## 📈 Performance Optimization

### Build Optimization
- **Layer Caching**: Docker BuildKit caching
- **Multi-stage Builds**: Optimized image sizes
- **Parallel Building**: Concurrent service building
- **Registry Caching**: Container registry layer caching

### Deployment Optimization
- **Blue-Green Deployments**: Zero-downtime deployments
- **Rolling Updates**: Gradual service updates
- **Health Checks**: Proactive health monitoring
- **Resource Limits**: Optimized resource allocation

### Monitoring Optimization
- **Metric Aggregation**: Efficient metric collection
- **Alert Tuning**: Reduced false positive alerts
- **Dashboard Optimization**: Fast-loading dashboards
- **Data Retention**: Balanced storage and performance

## 🚨 Troubleshooting

### Common Issues

1. **Build Failures**:
   ```bash
   # Check build logs
   docker logs <container_id>
   
   # Validate Dockerfile
   docker build --no-cache -t test-image .
   ```

2. **Deployment Failures**:
   ```bash
   # Check pod status
   kubectl get pods -n parallel-ai-system
   
   # View pod logs
   kubectl logs <pod-name> -n parallel-ai-system
   
   # Describe pod for events
   kubectl describe pod <pod-name> -n parallel-ai-system
   ```

3. **Test Failures**:
   ```bash
   # Run tests with verbose output
   ./scripts/test.sh unit all --verbose
   
   # Check test environment
   docker-compose -f docker-compose.test.yml ps
   ```

### Debug Commands

```bash
# Check GitHub Actions logs
gh run list
gh run view <run-id>

# Validate Kubernetes resources
kubectl apply --dry-run=client -f deploy/kubernetes/

# Test Helm templates
helm template parallel-ai deploy/helm/parallel-ai/ --debug

# Check monitoring
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
kubectl port-forward svc/grafana 3000:80 -n monitoring
```

## 📝 Contributing

### Adding New Services

1. Create Dockerfile in `docker/<service-name>/`
2. Add service configuration to Helm chart
3. Update build and test scripts
4. Add monitoring configuration
5. Update documentation

### Modifying Pipeline

1. Test changes in feature branch
2. Validate with dry-run deployments
3. Monitor staging environment
4. Create pull request with thorough testing
5. Deploy to production after approval

### Best Practices

- **Branch Protection**: Require PR reviews and status checks
- **Environment Parity**: Keep staging and production similar
- **Monitoring First**: Add monitoring before deploying new features
- **Security Scanning**: Regular security updates and scans
- **Documentation**: Keep documentation up to date

## 📞 Support

For issues or questions regarding the CI/CD pipeline:

- **GitHub Issues**: Create an issue in the repository
- **Slack Channel**: `#devops-support`
- **Documentation**: Check the `docs/` directory
- **Runbooks**: See `docs/runbooks/` for operational procedures

---

This CI/CD pipeline provides a robust, secure, and scalable deployment solution for the Parallel AI System with comprehensive monitoring, automated testing, and reliable rollback capabilities.