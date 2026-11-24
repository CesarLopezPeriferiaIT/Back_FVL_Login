/**
 * Application mail service.
 *
 * Builds message content and delivers it to the configured transport.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { MailSender } from './ports.js';
import {
  plantillaCodigoAcceso,
  plantillaCodigoConfirmacion,
} from '../infrastructure/mail/templates.js';

/** Contrato de envio de correo. */
export interface MailService {
  /** Envia el codigo de acceso para iniciar sesion. */
  enviarCodigoAcceso(correo: string, codigo: string, expiraEn: Date): Promise<void>;
  enviarCodigoConfirmacion(destinatario: string, codigo: string, expiraEn: Date): Promise<void>;
}

/**
 * Crea el servicio de correo sobre el transporte indicado.
 */
export const createMailService = (sender: MailSender): MailService => ({
  enviarCodigoAcceso: async (correo: string, codigo: string, expiraEn: Date): Promise<void> => {
    const contenido = plantillaCodigoAcceso({ codigo, expiraEn });
    await sender.enviar({ destinatario: correo, ...contenido });
  },
  enviarCodigoConfirmacion: async (
    destinatario: string,
    codigo: string,
    expiraEn: Date,
  ): Promise<void> => {
    const contenido = plantillaCodigoConfirmacion({ codigo, expiraEn });
    await sender.enviar({ destinatario, ...contenido });
  },
});
