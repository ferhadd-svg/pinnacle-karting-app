function required(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgres://postgres:postgres@localhost:5432/karting'),
  // Production must provide a long random secret; the dev default is deliberately obvious.
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-jwt-secret-change-me'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  logLevel: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'warn'),
};
