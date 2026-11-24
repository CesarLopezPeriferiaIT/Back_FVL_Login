/**
 * Plantillas de los correos que envia el servicio.
 *
 * El contenido esta en espanol porque es la communication directa con el usuario final de las
 * aplicaciones de la Fundacion.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */

/** Contenido completo de un correo saliente. */
export interface ContenidoCorreo {
  asunto: string;
  texto: string;
  html: string;
}

const envolver = (titulo: string, cuerpo: string): string => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${titulo}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2933;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;">
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#0b3d6b;">${titulo}</h1>
          ${cuerpo}
          <p style="margin:24px 0 0;font-size:12px;color:#52606d;">
            Si usted no realizo esta solicitud, ignore este mensaje.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const horasRestantes = (expiraEn: Date): number =>
  Math.max(1, Math.ceil((expiraEn.getTime() - Date.now()) / 3600000));

/** Construye el correo de confirmacion por codigo. */
export const plantillaCodigoConfirmacion = (params: {
  codigo: string;
  expiraEn: Date;
}): ContenidoCorreo => {
  const horas = horasRestantes(params.expiraEn);
  const vencimiento = `El codigo expira en ${horas} ${horas === 1 ? 'hora' : 'horas'}.`;
  const mensaje =
    'Gracias por registrarse. Confirme su cuenta con el siguiente codigo para poder iniciar sesion.';
  return {
    asunto: 'Confirme su cuenta en el portal de la Fundacion Valle del Lili',
    texto: ['Hola,', mensaje, params.codigo, vencimiento].join('\n\n'),
    html: envolver(
      'Confirme su cuenta',
      `<p>Hola,</p><p>${mensaje}</p><p style="font-size:24px;font-weight:bold;letter-spacing:2px;">${params.codigo}</p><p>${vencimiento}</p>`,
    ),
  };
};
