# ABA Worker Test Suite

This directory contains comprehensive tests for the ABA Worker processed date tracking functionality.

## Overview

The test suite covers three main areas:

1. **StatusUpdateScheduler Expiry Methods** - Tests for processed date tracking logic
2. **Migration Scripts** - Tests for database schema migrations
3. **Test Sync Functionality** - Tests for the test synchronization system

## Test Structure

```
src/test/
├── setup.ts              # Jest setup with MongoDB Memory Server
├── StatusUpdateScheduler.test.ts  # Expiry processing tests
├── migration.test.ts     # Migration script tests
├── testSync.test.ts      # Test sync functionality tests
└── README.md            # This file
```

## Key Features Tested

### 🔄 Processed Date Tracking

**Before (2-year window):**
```javascript
expiration_date: {
    $lt: tomorrowStartOfDay,
    $gte: twoYearsAgoStartOfDay  // ❌ Fixed 2-year limit
}
```

**After (Incremental processing):**
```javascript
expiration_date: {
    $lt: tomorrowStartOfDay,
    $gt: company.lastExpiryCheckDate  // ✅ Only new expirations
}
```

### 📊 Test Scenarios Covered

#### StatusUpdateScheduler Tests
- ✅ Only processes documents newer than `lastExpiryCheckDate`
- ✅ Updates `lastExpiryCheckDate` after processing
- ✅ Handles companies without `lastExpiryCheckDate` gracefully
- ✅ Skips companies with disabled service modules
- ✅ Processes unpaid invoices only (payment logic)
- ✅ Error handling and recovery

#### Migration Tests
- ✅ Adds `serviceModules` field with defaults to new companies
- ✅ Adds `lastExpiryCheckDate` to existing companies
- ✅ Handles companies with partial serviceModules
- ✅ Provides accurate migration statistics
- ✅ Leaves complete companies unchanged

#### Test Sync Tests
- ✅ Uses `TEST_SYNC_COMPANY_ID` when specified
- ✅ Validates company meets service module requirements
- ✅ Falls back to automatic selection on invalid company ID
- ✅ Applies size constraints (<50 invoices/vehicles) for automatic selection
- ✅ Handles environment variable parsing
- ✅ Graceful error handling

## Running Tests

### Prerequisites
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test StatusUpdateScheduler.test.ts
npm test migration.test.ts
npm test testSync.test.ts
```

## Environment Variables for Testing

The tests use these environment variables:

```bash
# Test sync configuration
TEST_SYNC_STATUS_UPDATE=true     # Enable status update tests
TEST_SYNC_MAINTENANCE=true       # Enable maintenance tests
TEST_SYNC_RDW=true              # Enable RDW sync tests
TEST_SYNC_COMPANY_ID=<id>       # Specify test company ID (optional)
```

## Test Database

Tests use **MongoDB Memory Server** for isolated, fast testing:

- ✅ In-memory database (no disk I/O)
- ✅ Fresh database for each test
- ✅ No interference with development/production data
- ✅ Automatic cleanup between tests

## Test Coverage

The test suite provides comprehensive coverage of:

### Core Functionality
- [x] Processed date tracking logic
- [x] Incremental expiry processing
- [x] Company-specific processing
- [x] Service module validation

### Edge Cases
- [x] Missing `lastExpiryCheckDate` field
- [x] Companies with disabled modules
- [x] Invalid company IDs
- [x] Database connection errors
- [x] Large company filtering (>50 invoices/vehicles)

### Data Integrity
- [x] Only processes unpaid documents
- [x] Correct status transitions
- [x] Notification creation
- [x] Date field updates

### Migration Safety
- [x] Idempotent operations
- [x] Partial migration handling
- [x] Data preservation
- [x] Rollback scenarios

## Performance Characteristics

### Before (2-year window)
- **Query**: Scan all expired docs from last 2 years
- **Complexity**: O(n) where n = docs in 2-year window
- **Scalability**: Poor - grows with historical data
- **Predictability**: Unpredictable performance

### After (Processed date tracking)
- **Query**: Scan only docs expired since last check
- **Complexity**: O(m) where m = docs expired since last run
- **Scalability**: Excellent - bounded by recent activity
- **Predictability**: Consistent, bounded performance

## Integration with CI/CD

The tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    cd aba-worker
    npm ci
    npm test -- --coverage --watchAll=false
```

## Debugging Tests

### Enable Debug Logging
```bash
DEBUG=test npm test
```

### Run Single Test with Details
```bash
npm test -- --verbose StatusUpdateScheduler.test.ts
```

### Inspect Test Database
```javascript
// Add to test for debugging
console.log(await db.models.Company.find({}));
console.log(await db.models.Quote.find({}));
```

## Contributing

When adding new tests:

1. **Follow naming convention**: `*.test.ts`
2. **Use descriptive test names**: `it('should do X when Y')`
3. **Clean up after tests**: Use `beforeEach` for setup
4. **Test edge cases**: Invalid inputs, error conditions
5. **Document environment variables**: Update this README

## Troubleshooting

### Common Issues

**MongoDB Memory Server fails to start:**
```bash
# Check available memory
free -h

# Try different version
npm install mongodb-memory-server@8.15.0
```

**Tests time out:**
```javascript
// Increase timeout in test
it('should do something', async () => {
  // ... test code
}, 30000); // 30 second timeout
```

**Environment variable issues:**
```bash
# Ensure clean environment
unset TEST_SYNC_*
npm test
```

This test suite ensures the processed date tracking system works reliably and efficiently across all scenarios! 🚀
