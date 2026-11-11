/**
 * Configuracion de prueba con valores validos y deterministas.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import type { AppConfig } from '../../src/config/env.js';

const SECRETO_DE_PRUEBA = 'secreto-de-prueba-con-al-menos-32-caracteres';

/**
 * Construye una configuracion valida para las pruebas automatizadas.
 */
export const configDePrueba = (): AppConfig => ({
  ambiente: 'dev',
  apiVersion: 1,
  port: 3000,
  publicBaseUrl: 'https://login.pruebas.fvl.org.co',
  tycVersion: '1.0.0',
  jwt: {
    accessSecret: SECRETO_DE_PRUEBA,
    accessTtl: '15m',
    confirmSecret: `${SECRETO_DE_PRUEBA}-confirmacion`,
    confirmTtl: '24h',
    resetSecret: `${SECRETO_DE_PRUEBA}-reseteo`,
    resetTtl: '30m',
    issuer: 'fvl-login',
    audience: 'fvl-clients',
  },
  db: {
    server: 'localhost',
    port: 1433,
    database: 'FVL_Login',
    user: 'fvl_login_app',
    password: 'contrasena-de-prueba',
    encrypt: true,
    trustServerCertificate: true,
    poolMax: 5,
    connectTimeoutMs: 5000,
  },
  refresh: { ttlDays: 30 },
  cors: { allowedOrigins: ['https://app.pruebas.fvl.org.co'] },
  trustedProxyCidrs: ['127.0.0.1/32'],
  rateLimit: {
    loginPerIdentifier: 10,
    loginPerIp: 50,
    windowMinutes: 15,
    registerPerIp: 20,
  },
  mail: {
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    from: 'no-reply@fvl.org.co',
    transport: 'console',
  },
  logLevel: 'error',
});
