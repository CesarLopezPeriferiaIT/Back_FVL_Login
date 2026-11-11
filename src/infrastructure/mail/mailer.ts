/**
 * Transporte de correo sobre SMTP con alternativa de consola para desarrollo.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import nodemailer from 'nodemailer';
import type { AppConfig } from '../../config/env.js';
import type { MailSender, MensajeCorreo } from '../../domain/ports.js';
import type { Logger } from '../../shared/logger.js';

/**
 * Crea el transporte de correo segun la configuracion.
 *
 * El transporte de consola existe unicamente para desarrollo: imprime el cuerpo del mensaje, que
 * incluye el token de un solo uso, para que el equipo pueda completar el flujo sin un buzon real.
 * La validacion de la configuracion impide activarlo fuera del ambiente de desarrollo.
 */
export const createMailSender = (config: AppConfig, logger: Logger): MailSender => {
  if (config.mail.transport === 'console' || config.mail.host === '') {
    return {
      enviar: (mensaje: MensajeCorreo): Promise<void> => {
        logger.info('Correo emitido por el transporte de consola', {
          destinatario: mensaje.destinatario,
          asunto: mensaje.asunto,
          cuerpo: mensaje.texto,
        });
        return Promise.resolve();
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    ...(config.mail.user ? { auth: { user: config.mail.user, pass: config.mail.password } } : {}),
  });

  return {
    enviar: async (mensaje: MensajeCorreo): Promise<void> => {
      await transporter.sendMail({
        from: config.mail.from,
        to: mensaje.destinatario,
        subject: mensaje.asunto,
        text: mensaje.texto,
        html: mensaje.html,
      });
    },
  };
};
