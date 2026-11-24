/**
 * Servicio de correo de la aplicacion.
 *
 * Construye el contenido de los mensajes y los entrega al transporte configurado.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { MailSender } from './ports.js';
import {
  plantillaConfirmacion,
  plantillaCodigoConfirmacion,
} from '../infrastructure/mail/templates.js';

/** Contrato de envio de correo. */
export interface MailService {
  enviarConfirmacion(destinatario: string, enlace: string): Promise<void>;
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
  enviarConfirmacion: async (destinatario: string, enlace: string): Promise<void> => {
    const contenido = plantillaConfirmacion({ enlace });
    await sender.enviar({
      destinatario,
      asunto: contenido.asunto,
      texto: contenido.texto,
      html: contenido.html,
    });
  },
});
