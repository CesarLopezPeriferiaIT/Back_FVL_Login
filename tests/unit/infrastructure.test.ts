/**
 * Verify configuration, logging, mail transports and database error classification.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createMailSender } from '../../src/infrastructure/mail/mailer.js';
import { esClaveDuplicada } from '../../src/shared/errors.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

const entorno = (): NodeJS.ProcessEnv => ({
  APP_ENV: 'dev',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_CONFIRM_SECRET: 'b'.repeat(32),
  JWT_RESET_SECRET: 'c'.repeat(32),
  DB_SERVER: 'localhost',
  DB_DATABASE: 'prueba',
  DB_USER: 'usuario',
  DB_PASSWORD: 'prueba',
  DB_ENCRYPT: 'true',
  DB_TRUST_SERVER_CERTIFICATE: 'false',
  MAIL_TRANSPORT: 'console',
});

describe('infraestructura', () => {
  it('valida y normaliza el entorno', () => {
    const config = loadConfig(entorno());
    expect(config.db.encrypt).toBe(true);
    expect(config.db.trustServerCertificate).toBe(false);
    const inverso = loadConfig({
      ...entorno(),
      DB_ENCRYPT: 'false',
      DB_TRUST_SERVER_CERTIFICATE: 'true',
    });
    expect(inverso.db.encrypt).toBe(false);
    expect(inverso.db.trustServerCertificate).toBe(true);
    expect(() => loadConfig({ ...entorno(), DB_SERVER: undefined })).toThrow('DB_SERVER');
    expect(() => loadConfig({ ...entorno(), APP_ENV: 'prd' })).toThrow('MAIL_TRANSPORT');
    expect(
      loadConfig({
        ...entorno(),
        APP_ENV: 'qas',
        MAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example',
      }).ambiente,
    ).toBe('qas');
  });

  it('usa el logger en consola sin abrir transporte SMTP', async () => {
    mocks.createTransport.mockClear();
    const logger = createLogger('info');
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const mensaje = {
      destinatario: 'a@example.co',
      asunto: 'Asunto',
      texto: 'Texto',
      html: '<p>Texto</p>',
    };
    await createMailSender(configDePrueba(), logger).enviar(mensaje);
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('Correo emitido por el transporte de consola', {
      destinatario: mensaje.destinatario,
      asunto: mensaje.asunto,
      cuerpo: mensaje.texto,
    });
  });

  it('envia todos los campos mediante SMTP', async () => {
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue(undefined);
    const config = configDePrueba();
    config.mail.transport = 'smtp';
    config.mail.host = 'smtp.example';
    config.mail.user = 'usuario';
    config.mail.password = 'prueba';
    const mensaje = {
      destinatario: 'a@example.co',
      asunto: 'Asunto',
      texto: 'Texto',
      html: '<p>Texto</p>',
    };
    await createMailSender(config, createLogger('error')).enviar(mensaje);
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: config.mail.from,
      to: mensaje.destinatario,
      subject: mensaje.asunto,
      text: mensaje.texto,
      html: mensaje.html,
    });
  });

  it('filtra niveles y escribe JSON por linea', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const logger = createLogger('warn');
    logger.debug('omitido');
    logger.info('omitido');
    logger.warn('aviso', { id: 1 });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();
    const linea = String(stderr.mock.calls[0]?.[0]);
    expect(linea.endsWith('\n')).toBe(true);
    expect(JSON.parse(linea)).toMatchObject({ nivel: 'warn', mensaje: 'aviso', id: 1 });
  });

  it('clasifica errores de clave duplicada', () => {
    expect(esClaveDuplicada({ number: 2601 })).toBe(true);
    expect(esClaveDuplicada({ number: 2627 })).toBe(true);
    expect(esClaveDuplicada(new Error('otro'))).toBe(false);
    expect(esClaveDuplicada({ originalError: { info: { number: 2601 } } })).toBe(true);
    expect(esClaveDuplicada(null)).toBe(false);
  });
});
