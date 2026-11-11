/**
 * Carga y validacion de la configuracion del servicio a partir de variables de entorno.
 *
 * La validacion falla de forma explicita cuando falta un valor obligatorio o cuando un secreto
 * no cumple la longitud minima, porque los lineamientos exigen no dejar configuraciones por
 * defecto en los ambientes de despliegue.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';

/** Ambientes en los que puede ejecutarse el servicio. */
export type Ambiente = 'dev' | 'qas' | 'prd';

/** Niveles de detalle disponibles para los logs estructurados. */
export type NivelLog = 'debug' | 'info' | 'warn' | 'error';

/** Transportes disponibles para el envio de correo. */
export type TransporteCorreo = 'smtp' | 'console';

const ambienteSchema = z.enum(['dev', 'qas', 'prd']);
const nivelLogSchema = z.enum(['debug', 'info', 'warn', 'error']);
const transporteCorreoSchema = z.enum(['smtp', 'console']);
const booleanoSchema = z.enum(['true', 'false']).transform((valor) => valor === 'true');
const listaSeparadaSchema = z
  .string()
  .default('')
  .transform((valor) =>
    valor
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const envSchema = z.object({
  APP_ENV: ambienteSchema.default('dev'),
  API_VERSION: z.coerce.number().int().positive().default(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  TYC_VERSION: z.string().min(1).default('1.0.0'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_CONFIRM_SECRET: z.string().min(32),
  JWT_CONFIRM_TTL: z.string().min(1).default('24h'),
  JWT_RESET_SECRET: z.string().min(32),
  JWT_RESET_TTL: z.string().min(1).default('30m'),
  JWT_ISSUER: z.string().min(1).default('fvl-login'),
  JWT_AUDIENCE: z.string().min(1).default('fvl-clients'),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
  DB_DATABASE: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: booleanoSchema.default(false),
  DB_TRUST_SERVER_CERTIFICATE: booleanoSchema.default(false),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(15000),

  CORS_ALLOWED_ORIGINS: listaSeparadaSchema,
  TRUSTED_PROXY_CIDRS: listaSeparadaSchema,

  RATE_LIMIT_LOGIN_PER_IDENTIFIER: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_PER_IP: z.coerce.number().int().positive().default(50),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_REGISTER_PER_IP: z.coerce.number().int().positive().default(20),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanoSchema.default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().min(1).default('no-reply@fvl.org.co'),
  MAIL_TRANSPORT: transporteCorreoSchema.default('smtp'),

  LOG_LEVEL: nivelLogSchema.default('info'),
});

/** Configuracion efectiva del servicio, ya validada y normalizada. */
export interface AppConfig {
  ambiente: Ambiente;
  apiVersion: number;
  port: number;
  publicBaseUrl: string;
  tycVersion: string;
  jwt: {
    accessSecret: string;
    accessTtl: string;
    confirmSecret: string;
    confirmTtl: string;
    resetSecret: string;
    resetTtl: string;
    issuer: string;
    audience: string;
  };
  db: {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    poolMax: number;
    connectTimeoutMs: number;
  };
  refresh: { ttlDays: number };
  cors: { allowedOrigins: string[] };
  trustedProxyCidrs: string[];
  rateLimit: {
    loginPerIdentifier: number;
    loginPerIp: number;
    windowMinutes: number;
    registerPerIp: number;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    transport: TransporteCorreo;
  };
  logLevel: NivelLog;
}

/**
 * Transforma el resultado validado del esquema de variables de entorno en la configuracion
 * tipada que consume el resto de la aplicacion.
 */
const toAppConfig = (valores: z.infer<typeof envSchema>): AppConfig => ({
  ambiente: valores.APP_ENV,
  apiVersion: valores.API_VERSION,
  port: valores.PORT,
  publicBaseUrl: valores.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  tycVersion: valores.TYC_VERSION,
  jwt: {
    accessSecret: valores.JWT_ACCESS_SECRET,
    accessTtl: valores.JWT_ACCESS_TTL,
    confirmSecret: valores.JWT_CONFIRM_SECRET,
    confirmTtl: valores.JWT_CONFIRM_TTL,
    resetSecret: valores.JWT_RESET_SECRET,
    resetTtl: valores.JWT_RESET_TTL,
    issuer: valores.JWT_ISSUER,
    audience: valores.JWT_AUDIENCE,
  },
  db: {
    server: valores.DB_SERVER,
    port: valores.DB_PORT,
    database: valores.DB_DATABASE,
    user: valores.DB_USER,
    password: valores.DB_PASSWORD,
    encrypt: valores.DB_ENCRYPT,
    trustServerCertificate: valores.DB_TRUST_SERVER_CERTIFICATE,
    poolMax: valores.DB_POOL_MAX,
    connectTimeoutMs: valores.DB_POOL_CONNECT_TIMEOUT,
  },
  refresh: { ttlDays: valores.REFRESH_TOKEN_TTL_DAYS },
  cors: { allowedOrigins: valores.CORS_ALLOWED_ORIGINS },
  trustedProxyCidrs: valores.TRUSTED_PROXY_CIDRS,
  rateLimit: {
    loginPerIdentifier: valores.RATE_LIMIT_LOGIN_PER_IDENTIFIER,
    loginPerIp: valores.RATE_LIMIT_LOGIN_PER_IP,
    windowMinutes: valores.RATE_LIMIT_WINDOW_MINUTES,
    registerPerIp: valores.RATE_LIMIT_REGISTER_PER_IP,
  },
  mail: {
    host: valores.SMTP_HOST,
    port: valores.SMTP_PORT,
    secure: valores.SMTP_SECURE,
    user: valores.SMTP_USER,
    password: valores.SMTP_PASSWORD,
    from: valores.MAIL_FROM,
    transport: valores.MAIL_TRANSPORT,
  },
  logLevel: valores.LOG_LEVEL,
});

/**
 * Lee y valida la configuracion desde el entorno del proceso.
 *
 * @throws Error cuando alguna variable obligatoria falta o es invalida.
 */
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const resultado = envSchema.safeParse(source);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuracion de entorno invalida: ${detalle}`);
  }

  const config = toAppConfig(resultado.data);

  // El transporte de consola imprime el cuerpo del correo, que incluye el token de un solo uso.
  // Por eso solo se admite en desarrollo y no en los ambientes de calidad o produccion.
  if (
    config.ambiente !== 'dev' &&
    (config.mail.transport === 'console' || config.mail.host === '')
  ) {
    throw new Error(
      'Configuracion de entorno invalida: SMTP_HOST y MAIL_TRANSPORT=smtp son obligatorios fuera del ambiente dev',
    );
  }

  return config;
};
