
# ABA Worker Microservice

A Node.js/TypeScript microservice for handling APK (Algemene Periodieke Keuring - Dutch vehicle inspection) synchronization with RDW (Dutch vehicle registration authority), APK status checks, notification creation, and reminder notifications.

## Features

- APK data synchronization with RDW
- Automated APK status monitoring
- Email notification system
- Scheduled background jobs for reminders
- REST API endpoints for APK management
- MongoDB integration for data persistence
- Health checks and monitoring
- Production-ready Docker deployment
- Graceful shutdown handling

## Tech Stack

- **Runtime**: Node.js 22 with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose (partial schemas for optimization)
- **Scheduling**: node-cron
- **HTTP Client**: Axios
- **Email**: Nodemailer
- **Caching**: node-cache
- **Date Handling**: date-fns
- **Process Management**: PM2
- **Containerization**: Docker

## Quick Start

### Development

```bash
# Install dependencies
yarn install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your configuration

# Start development server with hot reload
yarn dev

# Run tests
yarn test

# Run linter
yarn lint
```

### Production

```bash
# Build the application
yarn build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Or run directly
NODE_ENV=production yarn start
```

### Docker

```bash
# Build Docker image
docker build -t aba-worker .

# Run container
docker run -p 3000:3000 \
  -e MONGO_STRING="your_mongodb_connection_string" \
  -e NODE_ENV=production \
  aba-worker
```

## Environment Variables

### Required

- `MONGO_STRING`: MongoDB connection string (required)

### Optional

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production, default: development)
- `LOG_LEVEL`: Logging level (error/warn/info/debug, default: info)
- `RDW_API_KEY`: RDW API key for real vehicle data (optional - uses mock data if not provided)
- `RDW_BASE_URL`: RDW API base URL (default: https://api.rdw.nl)
- `TEST_SYNC_STATUS_UPDATE`: Enable status update scheduler test on startup (default: false)
- `TEST_SYNC_MAINTENANCE`: Enable maintenance reminder test on startup (default: false)
- `TEST_SYNC_RDW`: Enable RDW sync test on startup (default: false)

### Example .env file

```bash
# Server Configuration
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Database
MONGO_STRING=mongodb://localhost:27017/aba-worker

# RDW Integration (optional - uses mock data if not configured)
RDW_API_KEY=your_rdw_api_key_here
RDW_BASE_URL=https://api.rdw.nl

# Test Sync Flags (optional - enable individual service tests on startup)
TEST_SYNC_STATUS_UPDATE=false
TEST_SYNC_MAINTENANCE=false
TEST_SYNC_RDW=false

# Email Configuration (if applicable)
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your_email@gmail.com
# EMAIL_PASS=your_app_password
```

## API Endpoints

### Health Check
- `GET /health` - Comprehensive health check with database connectivity, memory usage, and system status

### Metrics
- `GET /metrics` - System metrics including memory usage, CPU usage, and uptime

### Example Health Response
```json
{
  "status": "healthy",
  "service": "aba-worker",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.4",
  "environment": "production",
  "database": {
    "mongodb": "connected",
    "name": "aba-worker",
    "host": "localhost"
  },
  "scheduler": {
    "status": "running",
    "uptime": 3600
  },
  "memory": {
    "used": 45,
    "total": 128,
    "unit": "MB"
  }
}
```

## Architecture

### Schema Optimization

This service uses **partial schemas** - only the fields actually used by the worker service are included in each model:

- **Client**: `name`, `deleted`, `companyId`, `apkNotificationsDisabled`
- **Company**: `name`, `lastActiveAt`
- **Vehicle**: `license_plate`, `apk_expiry`, `datum_tenaamstelling`, etc. (all used fields)
- **Quote/Invoice**: All fields used by StatusUpdateScheduler

This optimization reduces memory usage and improves query performance.

### Background Jobs

- **StatusUpdateScheduler**: Updates expired quotes/invoices daily
- **MaintenanceReminderService**: Sends maintenance reminders
- **RdwSyncService**: Synchronizes vehicle data with RDW API

### Test Sync on Startup

The application can run selective test syncs on startup to verify service functionality:

- **TEST_SYNC_STATUS_UPDATE=true**: Tests quote/invoice status updates
- **TEST_SYNC_MAINTENANCE=true**: Tests maintenance reminder processing
- **TEST_SYNC_RDW=true**: Tests RDW vehicle data synchronization

Each test runs with a single active company and limited scope for quick validation.

### RDW Integration

The service integrates with the Dutch RDW (Rijksdienst voor het Wegverkeer) API to fetch real vehicle data:

- **API Key**: Configure `RDW_API_KEY` for production use
- **Fallback**: Uses mock data when API key is not configured (development mode)
- **Data Fields**: Fetches APK expiry dates, vehicle details, ownership changes, and export status
- **Error Handling**: Graceful fallback to existing data if RDW API is unavailable

## Deployment

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t aba-worker:latest .
   ```

2. **Run with docker-compose:**
   ```yaml
   version: '3.8'
   services:
     aba-worker:
       image: aba-worker:latest
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
         - MONGO_STRING=mongodb://mongo:27017/aba-worker
       depends_on:
         - mongo
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
         interval: 30s
         timeout: 10s
         retries: 3
   ```

### PM2 Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Set up PM2 startup script
pm2 startup
```

## Monitoring

### Health Checks

The service provides comprehensive health checks at `/health` including:
- Database connectivity
- Memory usage
- Uptime information
- Service status

### Logs

PM2 provides structured logging:
- Error logs: `./logs/err.log`
- Output logs: `./logs/out.log`
- Combined logs: `./logs/combined.log`

### Metrics

Basic metrics are available through the health endpoint. For production monitoring, consider integrating with:
- Prometheus
- Grafana
- ELK Stack
- DataDog

## Security

### Production Security Features

- **Security Headers**: XSS protection, content type sniffing prevention, frame options
- **Request Limits**: JSON payload size limits (10MB)
- **Error Handling**: No sensitive information leaked in production
- **Non-root Container**: Runs as non-privileged user in Docker
- **Health Checks**: Built-in Docker health checks

### Best Practices

- Use environment variables for all configuration
- Rotate database credentials regularly
- Monitor logs for security events
- Keep dependencies updated
- Use HTTPS in production (terminate SSL at load balancer)

## Development

### Code Quality

```bash
# Run linter
yarn lint

# Build for production
yarn build

# Type checking
yarn tsc --noEmit
```

### Testing

```bash
# Run tests
yarn test

# Run tests with coverage
yarn test --coverage
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MONGO_STRING environment variable
   - Verify MongoDB is running and accessible

2. **Port Already in Use**
   - Change PORT environment variable
   - Check if another service is using the port

3. **Health Check Failing**
   - Check database connectivity
   - Verify all environment variables are set

### Logs

Check PM2 logs:
```bash
pm2 logs aba-worker
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## License

ISC
