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

const boton = (enlace: string, texto: string): string =>
  `<p style="margin:24px 0;">
     <a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#0b3d6b;color:#ffffff;text-decoration:none;border-radius:6px;">${texto}</a>
   </p>
   <p style="margin:0;font-size:12px;color:#52606d;word-break:break-all;">Si el enlace no funciona, copie esta direccion en su navegador:<br />${enlace}</p>`;

/**
 * Construye el correo de confirmacion de la cuenta.
 */
export const plantillaConfirmacion = (params: { enlace: string }): ContenidoCorreo => ({
  asunto: 'Confirme su cuenta en el portal de la Fundacion Valle del Lili',
  texto: [
    'Hola,',
    '',
    'Gracias por registrarse. Confirme su cuenta con el siguiente enlace para poder iniciar sesion.',
    '',
    params.enlace,
    '',
    'El enlace expira en 24 horas.',
  ].join('\n'),
  html: envolver(
    'Confirme su cuenta',
    `<p style="margin:0 0 8px;line-height:1.5;">Gracias por registrarse en el portal de la Fundacion Valle del Lili.</p>
     <p style="margin:0 0 8px;line-height:1.5;">Confirme su cuenta para poder iniciar sesion.</p>
     ${boton(params.enlace, 'Confirmar mi cuenta')}`,
  ),
});

/**
 * Construye el correo de reseteo de la contrasena.
 */
export const plantillaReseteo = (params: { enlace: string }): ContenidoCorreo => ({
  asunto: 'Restablecimiento de contrasena - Fundacion Valle del Lili',
  texto: [
    'Hola,',
    '',
    'Se solicito el restablecimiento de la contrasena de su cuenta. Utilice el siguiente enlace para definir una nueva contrasena.',
    '',
    params.enlace,
    '',
    'El enlace expira en 30 minutos y solo puede utilizarse una vez.',
  ].join('\n'),
  html: envolver(
    'Restablezca su contrasena',
    `<p style="margin:0 0 8px;line-height:1.5;">Se solicito el restablecimiento de la contrasena de su cuenta.</p>
     <p style="margin:0 0 8px;line-height:1.5;">Defina una nueva contrasena para volver a iniciar sesion.</p>
     ${boton(params.enlace, 'Definir nueva contrasena')}`,
  ),
});
