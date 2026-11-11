/**
 * Punto de entrada del microservicio de login.
 *
 * Compone las dependencias reales (base de datos, correo, tokens) y arranca el servidor HTTP.
 * Toda la logica de negocio vive en los servicios de dominio, que aqui solo se conectan.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createApiKeyService } from './domain/api-key-service.js';
import { createAuthService } from './domain/auth-service.js';
import { createMailService } from './domain/mail-service.js';
import { createPasswordHasher } from './domain/password-hasher.js';
import { createTokenService } from './domain/token-service.js';
import { createApiKeyRepository } from './infrastructure/database/api-key.repository.js';
import { closePool, createPool } from './infrastructure/database/pool.js';
import { createLogSessionRepository } from './infrastructure/database/log-session.repository.js';
import { createUsuarioRepository } from './infrastructure/database/usuario.repository.js';
import { createMailSender } from './infrastructure/mail/mailer.js';
import { createLogger } from './shared/logger.js';

const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const pool = await createPool(config);

  const authService = createAuthService({
    usuarios: createUsuarioRepository(pool),
    sesiones: createLogSessionRepository(pool),
    hasher: createPasswordHasher(),
    tokens: createTokenService(config),
    correo: createMailService(createMailSender(config, logger)),
    config,
    logger,
  });

  const app = createApp({
    config,
    logger,
    authService,
    apiKeyService: createApiKeyService(createApiKeyRepository(pool)),
    tokenService: createTokenService(config),
  });

  const servidor = app.listen(config.port, () => {
    logger.info('Microservicio de login en escucha', {
      puerto: config.port,
      ambiente: config.ambiente,
      prefijo: `/backend/${config.ambiente}/v${config.apiVersion}`,
    });
  });

  const detener = (senal: string): void => {
    logger.info('Cerrando el microservicio de login', { senal });
    servidor.close(() => {
      closePool(pool)
        .catch((error: unknown) => {
          logger.error('No fue posible cerrar el pool de la base de datos', {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => {
    void detener('SIGTERM');
  });
  process.on('SIGINT', () => {
    void detener('SIGINT');
  });
};

main().catch((error: unknown) => {
  process.stderr.write(
    `No fue posible iniciar el microservicio de login: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});
