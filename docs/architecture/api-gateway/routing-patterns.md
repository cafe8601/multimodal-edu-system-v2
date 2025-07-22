# Gateway Routing Patterns and Load Balancing

## Overview

Advanced routing patterns for the API Gateway that enable sophisticated traffic management, load balancing, and deployment strategies for the parallel AI system.

## Load Balancing Strategies

### 1. Intelligent Load Balancing

#### Weighted Round Robin

```yaml
routing_config:
  algorithm: weighted_round_robin
  upstream_targets:
    - target: ai-agent-service-v1
      weight: 70
      health_checks: enabled
    - target: ai-agent-service-v2
      weight: 30
      health_checks: enabled
  health_check:
    path: /health
    interval: 15s
    timeout: 5s
    healthy_threshold: 2
    unhealthy_threshold: 3
```

#### Least Connections with Response Time

```yaml
least_conn_config:
  algorithm: least_conn_rt
  parameters:
    response_time_weight: 0.7
    connection_count_weight: 0.3
    slow_start_duration: 30s
  upstream_monitoring:
    metrics:
      - active_connections
      - response_time_p95
      - error_rate
    update_interval: 5s
```

### 2. Geographic Load Balancing

```yaml
geo_routing:
  regions:
    us_east:
      priority: 1
      endpoints:
        - us-east-1.ai-service.internal
        - us-east-2.ai-service.internal
    us_west:
      priority: 2
      endpoints:
        - us-west-1.ai-service.internal
    europe:
      priority: 3
      endpoints:
        - eu-west-1.ai-service.internal
  fallback_strategy: nearest_healthy_region
  latency_threshold: 200ms
```

## Advanced Routing Patterns

### 1. Content-Based Routing

#### AI Model Routing

```yaml
model_routing:
  rules:
    - condition:
        header: "X-AI-Model"
        value: "gpt-4"
      target: high-performance-cluster
      resources:
        cpu: "4000m"
        memory: "8Gi"
        gpu: "1"
    - condition:
        header: "X-AI-Model"
        value: "claude-3"
      target: claude-optimized-cluster
      resources:
        cpu: "2000m"
        memory: "4Gi"
    - condition:
        path: "/api/v1/speech/*"
      target: speech-processing-cluster
      sticky_sessions: true
```

#### Request Size-Based Routing

```yaml
size_based_routing:
  rules:
    - condition:
        content_length: "> 10MB"
      target: large-payload-cluster
      timeout: 300s
      buffer_size: 64MB
    - condition:
        content_length: "< 1MB"
      target: fast-response-cluster
      timeout: 30s
      priority: high
```

### 2. User Context Routing

```yaml
user_routing:
  premium_users:
    condition:
      header: "X-User-Tier"
      value: "premium"
    target: premium-cluster
    rate_limit: 1000/min
    priority: high
  
  free_users:
    condition:
      header: "X-User-Tier"
      value: "free"
    target: standard-cluster
    rate_limit: 100/min
    priority: normal
    
  enterprise_users:
    condition:
      header: "X-User-Tier"
      value: "enterprise"
    target: dedicated-cluster
    rate_limit: unlimited
    sla: 99.9%
```

## Traffic Shaping and Control

### 1. Circuit Breaker Patterns

```yaml
circuit_breaker:
  configurations:
    ai_services:
      failure_threshold: 5
      success_threshold: 3
      timeout: 30s
      states:
        closed:
          success_rate: "> 95%"
        open:
          duration: 60s
          fallback: cached_response
        half_open:
          probe_requests: 3
          success_criteria: "2/3"
      
    database_services:
      failure_threshold: 3
      timeout: 10s
      fallback_strategy: read_replica
```

### 2. Retry Strategies

```yaml
retry_config:
  strategies:
    exponential_backoff:
      base_interval: 100ms
      max_interval: 5s
      multiplier: 2
      max_retries: 3
      jitter: true
      
    linear_backoff:
      interval: 500ms
      max_retries: 2
      
  conditions:
    - status_codes: [502, 503, 504]
    - connection_errors: true
    - timeout_errors: true
    
  exclude:
    - methods: [POST, PUT, DELETE]
    - paths: ["/api/v1/payment/*"]
```

## Canary Deployment Patterns

### 1. Progressive Traffic Splitting

```yaml
canary_deployment:
  rollout_strategy:
    phases:
      - traffic_percentage: 5
        duration: 30m
        success_criteria:
          error_rate: "< 0.1%"
          latency_p95: "< 200ms"
          
      - traffic_percentage: 25
        duration: 60m
        success_criteria:
          error_rate: "< 0.5%"
          latency_p95: "< 150ms"
          
      - traffic_percentage: 50
        duration: 120m
        success_criteria:
          error_rate: "< 0.2%"
          
      - traffic_percentage: 100
        auto_promote: true
        
  rollback_triggers:
    - error_rate: "> 2%"
    - latency_p95: "> 500ms"
    - custom_metric: "user_satisfaction < 90%"
```

### 2. Feature Flag Integration

```yaml
feature_routing:
  flags:
    new_ai_model:
      condition:
        header: "X-Feature-Flag"
        value: "new_ai_model=true"
      target: experimental-cluster
      traffic_split: 10%
      
    beta_features:
      condition:
        user_segment: "beta_testers"
      target: beta-cluster
      monitoring:
        enhanced: true
        metrics_retention: 30d
```

## High Availability Routing

### 1. Multi-Region Failover

```yaml
multi_region:
  primary_region: us-east-1
  secondary_regions:
    - us-west-2
    - eu-west-1
    
  failover_conditions:
    - primary_health: "< 95%"
    - response_time: "> 1s"
    - error_rate: "> 5%"
    
  dns_failover:
    ttl: 60s
    health_check_interval: 30s
    geographic_routing: enabled
```

### 2. Datacenter Awareness

```yaml
datacenter_routing:
  zones:
    zone_a:
      capacity: 40%
      latency_target: 50ms
    zone_b:
      capacity: 35%
      latency_target: 60ms
    zone_c:
      capacity: 25%
      latency_target: 80ms
      
  cross_zone_routing:
    enabled: true
    penalty_factor: 1.5
    max_cross_zone_ratio: 30%
```

## Performance Optimization

### 1. Connection Pooling

```yaml
connection_pooling:
  upstream_pools:
    ai_services:
      max_connections: 100
      max_pending: 50
      idle_timeout: 300s
      keep_alive: true
      
    database_services:
      max_connections: 20
      max_pending: 10
      idle_timeout: 60s
      prepared_statements: true
```

### 2. Caching Strategies

```yaml
routing_cache:
  response_cache:
    enabled: true
    ttl: 300s
    vary_headers:
      - Authorization
      - Accept-Language
      - X-API-Version
    
  route_cache:
    enabled: true
    size: 10000
    ttl: 3600s
    
  dns_cache:
    ttl: 300s
    negative_ttl: 60s
```

## Security Routing Patterns

### 1. Rate Limiting by Route

```yaml
route_rate_limiting:
  routes:
    "/api/v1/ai/generate":
      rate_limit: 10/min
      burst: 5
      key: user_id
      
    "/api/v1/auth/login":
      rate_limit: 5/min
      burst: 2
      key: ip_address
      lockout_duration: 300s
      
    "/api/v1/upload":
      rate_limit: 3/min
      max_file_size: 100MB
      allowed_types: ["image/*", "audio/*"]
```

### 2. IP Allowlisting/Blocklisting

```yaml
ip_filtering:
  allowlists:
    admin_endpoints:
      paths: ["/admin/*"]
      ips:
        - 192.168.1.0/24
        - 10.0.0.0/8
        
  blocklists:
    global:
      ips:
        - 192.0.2.0/24  # Documentation network
      countries: ["XX"]  # Blocked countries
      
  geo_blocking:
    enabled: true
    allowed_countries: ["US", "CA", "EU"]
    emergency_override: true
```

## Monitoring and Analytics

### 1. Routing Metrics

```yaml
routing_metrics:
  prometheus_metrics:
    - name: gateway_route_requests_total
      labels: [route, method, status_code, upstream]
    - name: gateway_route_duration_seconds
      labels: [route, upstream]
    - name: gateway_upstream_health
      labels: [upstream, datacenter, zone]
    - name: gateway_circuit_breaker_state
      labels: [service, state]
```

### 2. Request Tracing

```yaml
tracing_config:
  jaeger:
    sampling_rate: 0.1
    span_tags:
      - route_name
      - upstream_service
      - user_tier
      - geographic_region
      
  custom_headers:
    - X-Trace-ID
    - X-Span-ID
    - X-Parent-Span-ID
    - X-Route-Name
```

## Implementation Examples

### Kong Configuration

```yaml
# Kong route configuration
routes:
- name: ai-agent-route
  paths: ["/api/v1/ai"]
  methods: ["GET", "POST"]
  service:
    name: ai-agent-service
    host: ai-agents.internal
    port: 8080
    protocol: http
  plugins:
  - name: rate-limiting
    config:
      minute: 100
      policy: redis
  - name: request-transformer
    config:
      add:
        headers:
        - "X-Forwarded-Proto: https"
```

### Istio Configuration

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: ai-routing
spec:
  http:
  - match:
    - headers:
        x-ai-model:
          exact: gpt-4
    route:
    - destination:
        host: ai-service
        subset: gpu-cluster
      weight: 100
  - match:
    - uri:
        prefix: "/api/v1/speech"
    route:
    - destination:
        host: speech-service
      weight: 90
    - destination:
        host: speech-service-canary
      weight: 10
```

See [gateway-design.md](gateway-design.md) for core gateway architecture and [authentication-flow.md](authentication-flow.md) for security integration patterns.