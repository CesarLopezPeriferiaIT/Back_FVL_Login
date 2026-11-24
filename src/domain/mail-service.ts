/**
 * Application mail service.
 *
 * Builds message content and delivers it to the configured transport.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { MailSender } from './ports.js';
import { plantillaCodigoConfirmacion } from '../infrastructure/mail/templates.js';

/** Contrato de envio de correo. */
export interface MailService {
  enviarCodigoConfirmacion(destinatario: string, codigo: string, expiraEn: Date): Promise<void>;
}

/**
 * Crea el servicio de correo sobre el transporte indicado.
 */
export const createMailService = (sender: MailSender): MailService => ({
  enviarCodigoConfirmacion: async (
    destinatario: string,
    codigo: string,
    expiraEn: Date,
  ): Promise<void> => {
    const contenido = plantillaCodigoConfirmacion({ codigo, expiraEn });
    await sender.enviar({ destinatario, ...contenido });
  },
});
