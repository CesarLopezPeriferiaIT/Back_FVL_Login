/**
 * Verify configuration, logging, mail transports and database error classification.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createMailService } from '../../src/domain/mail-service.js';
import { createMailSender } from '../../src/infrastructure/mail/mailer.js';
import {
  plantillaCodigoAcceso,
  plantillaCodigoConfirmacion,
} from '../../src/infrastructure/mail/templates.js';
import { esClaveDuplicada, esLlaveForaneaInvalida } from '../../src/shared/errors.js';
import { createLogger } from '../../src/shared/logger.js';
import { configDePrueba } from '../helpers/config.js';

const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

const entorno = (): NodeJS.ProcessEnv => ({
  APP_ENV: 'dev',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  DB_SERVER: 'localhost',
  DB_DATABASE: 'prueba',
  DB_USER: 'usuario',
  DB_PASSWORD: 'prueba',
  DB_ENCRYPT: 'true',
  DB_TRUST_SERVER_CERTIFICATE: 'false',
  MAIL_TRANSPORT: 'console',
});

describe('infraestructura', () => {
  it('prepara el correo de acceso con vencimiento', () => {
    const correo = plantillaCodigoAcceso({
      codigo: '012345',
      expiraEn: new Date(Date.now() + 600000),
    });
    expect(correo.asunto).toBe('Codigo de acceso');
    expect(correo.texto).toContain('012345');
    expect(correo.texto).toContain('10 minutos');
    expect(correo.html).toContain('012345');
    expect(correo.html).toContain('10 minutos');
  });

  it('envia el codigo de acceso mediante SMTP', async () => {
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue(undefined);
    const config = configDePrueba();
    config.mail.transport = 'smtp';
    config.mail.host = 'smtp.example';
    await createMailService(createMailSender(config, createLogger('error'))).enviarCodigoAcceso(
      'a@example.co',
      '012345',
      new Date(Date.now() + 600000),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: config.mail.from,
        to: 'a@example.co',
        subject: 'Codigo de acceso',
      }),
    );
  });
  it('prepara el correo de codigo con vencimiento', () => {
    const correo = plantillaCodigoConfirmacion({
      codigo: '012345',
      expiraEn: new Date(Date.now() + 3600000),
    });
    expect(correo.asunto).toBe('Confirme su cuenta en el portal de la Fundacion Valle del Lili');
    expect(correo.texto.split('\n')).toContain('012345');
    expect(correo.texto).toContain('El codigo expira en 1 hora.');
    expect(correo.html).toContain('012345');
    expect(correo.html).toContain('El codigo expira en 1 hora.');
    const otro = plantillaCodigoConfirmacion({
      codigo: '123456',
      expiraEn: new Date(Date.now() + 24 * 3600000),
    });
    expect(otro.texto).toContain('El codigo expira en 24 horas.');
    expect(otro.html).toContain('El codigo expira en 24 horas.');
  });
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

  it('clasifica errores de llave foranea', () => {
    expect(esLlaveForaneaInvalida({ number: 547 })).toBe(true);
    expect(esLlaveForaneaInvalida({ number: 2601 })).toBe(false);
  });

  it('clasifica errores de clave duplicada', () => {
    expect(esClaveDuplicada({ number: 2601 })).toBe(true);
    expect(esClaveDuplicada({ number: 2627 })).toBe(true);
    expect(esClaveDuplicada(new Error('otro'))).toBe(false);
    expect(esClaveDuplicada({ originalError: { info: { number: 2601 } } })).toBe(true);
    expect(esClaveDuplicada(null)).toBe(false);
  });
});
