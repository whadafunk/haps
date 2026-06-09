// Must run before any app imports so config.ts reads these values
process.env['DATABASE_URL'] = 'postgresql://haps:haps_dev@localhost:5432/haps_test'
process.env['SESSION_SECRET'] = 'test-session-secret-minimum-32-chars!!'
process.env['JWT_SECRET'] = 'test-jwt-secret-minimum-32-chars!!!!'
process.env['APP_URL'] = 'http://localhost'
process.env['NODE_ENV'] = 'test'
process.env['DISABLE_RATE_LIMIT'] = 'true'
process.env['STORAGE_TYPE'] = 'local'
process.env['STORAGE_PATH'] = '/tmp/haps-test-uploads'
