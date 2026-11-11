/**
 * Builds the OpenAPI 3.1 document that describes the public API of the login service.
 *
 * The schemas of the request bodies are derived from the same zod validators that validate the
 * traffic at runtime, so the published documentation cannot drift from the accepted content.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';
import type {
  OpenAPIObject,
  ParameterObject,
  RequestBodyObject,
  ResponsesObject,
  SchemaObject,
  SecurityRequirementObject,
} from 'openapi3-ts/oas31';
import type { AppConfig } from '../config/env.js';
import {
  cambioSchema,
  emailSchema,
  loginSchema,
  refreshSchema,
  registroSchema,
  resetSchema,
  tokenSchema,
} from './validators/auth.validators.js';
import { instalacionSchema } from './validators/installation.validators.js';

/** Prefijo de las rutas de la API, igual al que usa el enrutador en tiempo de ejecucion. */
const prefijo = (config: AppConfig): string => `/backend/${config.ambiente}/v${config.apiVersion}`;

/**
 * Convierte un esquema de zod a JSON Schema de entrada. Se usa la entrada y no la salida porque
 * lo que se documenta es lo que el cliente envia, no lo que devuelve el servicio.
 */
const esquemaJson = (esquema: z.ZodType): Record<string, unknown> => {
  const generado = z.toJSONSchema(esquema, { io: 'input' }) as Record<string, unknown>;
  const copia = { ...generado };
  delete copia['$schema'];
  return copia;
};

const ESQUEMA_ERROR: SchemaObject = {
  type: 'object',
  properties: {
    codigo: { type: 'string', description: 'Identificador estable del error.' },
    detalles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Detalle de cada incidencia detectada.',
    },
  },
  required: ['codigo', 'detalles'],
};

const ESQUEMA_USUARIO: SchemaObject = {
  type: 'object',
  properties: {
    uuid: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    estado: {
      type: 'string',
      enum: ['A', 'I', 'C', 'D'],
      description: 'A activo, I inactivo, C por confirmar, D desactivada por intentos fallidos.',
    },
    tyc: { type: 'boolean', description: 'Aceptacion de los terminos y condiciones.' },
    fecha_creacion: { type: 'string', format: 'date-time' },
    fecha_modificacion: { type: 'string', format: 'date-time' },
  },
  required: ['uuid', 'email', 'estado', 'tyc', 'fecha_creacion', 'fecha_modificacion'],
};

const ESQUEMA_TOKEN_ACCESO: SchemaObject = {
  type: 'string',
  description: 'Token de acceso firmado, con vigencia de 15 minutos.',
};

const ESQUEMA_TOKEN_REFRESH: SchemaObject = {
  type: 'string',
  description: 'Token de renovacion opaco, que se rota en cada uso.',
};

const ESQUEMA_TOKEN_TYPE: SchemaObject = { type: 'string', enum: ['Bearer'] };

const ESQUEMA_EXPIRES_IN: SchemaObject = {
  type: 'integer',
  description: 'Segundos de vigencia del token de acceso.',
};

const ESQUEMA_REFRESH_EXPIRES: SchemaObject = { type: 'string', format: 'date-time' };

const ESQUEMA_CORREO_ENVIADO: SchemaObject = {
  type: 'boolean',
  description: 'Indica si se envio el correo de confirmacion de la cuenta.',
};

const ESQUEMA_SESION: SchemaObject = {
  type: 'object',
  properties: {
    token_acceso: ESQUEMA_TOKEN_ACCESO,
    token_refresh: ESQUEMA_TOKEN_REFRESH,
    token_type: ESQUEMA_TOKEN_TYPE,
    expires_in: ESQUEMA_EXPIRES_IN,
    refresh_expires_at: ESQUEMA_REFRESH_EXPIRES,
    usuario: ESQUEMA_USUARIO,
  },
  required: [
    'token_acceso',
    'token_refresh',
    'token_type',
    'expires_in',
    'refresh_expires_at',
    'usuario',
  ],
};

/**
 * Envuelve un esquema de contenido dentro del formato estandar de respuesta de la institucion.
 */
const envolver = (data: SchemaObject): SchemaObject => ({
  type: 'object',
  properties: {
    message: { type: 'string', description: 'Texto legible del resultado.' },
    error: {
      oneOf: [{ $ref: '#/components/schemas/Error' }, { type: 'null' }],
      description: 'Detalle del error, o null cuando la operacion fue exitosa.',
    },
    code: { type: 'integer', description: 'Cero en exito, o el codigo HTTP equivalente en error.' },
    data,
  },
  required: ['message', 'error', 'code', 'data'],
});

const DATOS_LIBRES: SchemaObject = {
  type: ['object', 'null'],
  additionalProperties: true,
};

const DATOS_NULOS: SchemaObject = { type: 'null' };

/** Catalogo de errores del servicio, para documentarlos de forma homogena. */
const ERRORES = {
  validacion: {
    codigo: 'VALIDACION_FALLIDA',
    status: '400',
    descripcion: 'El cuerpo de la peticion no cumple el esquema esperado.',
  },
  apiKeyRequerida: {
    codigo: 'API_KEY_REQUERIDA',
    status: '401',
    descripcion: 'Falta la cabecera X-API-Key del cliente.',
  },
  apiKeyInvalida: {
    codigo: 'API_KEY_INVALIDA',
    status: '401',
    descripcion: 'La API Key no existe en la base de datos.',
  },
  apiKeyRevocada: {
    codigo: 'API_KEY_REVOCADA',
    status: '401',
    descripcion: 'La API Key fue revocada.',
  },
  apiKeySinPermiso: {
    codigo: 'API_KEY_SIN_PERMISO',
    status: '403',
    descripcion: 'La API Key no tiene el alcance requerido por la ruta.',
  },
  tokenRequerido: {
    codigo: 'TOKEN_REQUERIDO',
    status: '401',
    descripcion: 'Falta el token de acceso del usuario.',
  },
  tokenInvalido: {
    codigo: 'TOKEN_INVALIDO',
    status: '400',
    descripcion: 'El enlace de correo no es valido, expiro o ya fue utilizado.',
  },
  credencialesInvalidas: {
    codigo: 'CREDENCIALES_INVALIDAS',
    status: '401',
    descripcion: 'Correo o contrasena incorrectos.',
  },
  passwordActualInvalida: {
    codigo: 'PASSWORD_ACTUAL_INVALIDA',
    status: '400',
    descripcion: 'La contrasena actual no es correcta.',
  },
  usuarioYaExiste: {
    codigo: 'USUARIO_YA_EXISTE',
    status: '409',
    descripcion: 'El correo ya se encuentra registrado.',
  },
  usuarioNoEncontrado: {
    codigo: 'USUARIO_NO_ENCONTRADO',
    status: '404',
    descripcion: 'La cuenta no existe.',
  },
  cuentaPorConfirmar: {
    codigo: 'CUENTA_POR_CONFIRMAR',
    status: '403',
    descripcion: 'La cuenta aun no ha sido confirmada con el correo electronico.',
  },
  cuentaInactiva: {
    codigo: 'CUENTA_INACTIVA',
    status: '403',
    descripcion: 'La cuenta se encuentra inactiva.',
  },
  cuentaDesactivada: {
    codigo: 'CUENTA_DESACTIVADA',
    status: '403',
    descripcion: 'La cuenta fue desactivada por superar el limite de intentos fallidos.',
  },
  cuentaYaConfirmada: {
    codigo: 'CUENTA_YA_CONFIRMADA',
    status: '409',
    descripcion: 'La cuenta ya fue confirmada.',
  },
  sesionInvalida: {
    codigo: 'SESION_INVALIDA',
    status: '401',
    descripcion: 'La sesion no es valida, expiro o fue revocada.',
  },
  rateLimit: {
    codigo: 'RATE_LIMIT_EXCEDIDO',
    status: '429',
    descripcion: 'Se supero el limite de solicitudes permitidas.',
  },
} as const;

type ErrorCatalogado = (typeof ERRORES)[keyof typeof ERRORES];

/**
 * Construye el mapa de respuestas de error de una operacion a partir del catalogo.
 */
const respuestasDeError = (...errores: readonly ErrorCatalogado[]): ResponsesObject => {
  const respuestas: ResponsesObject = {};
  for (const error of errores) {
    respuestas[error.status] = {
      description: error.descripcion,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RespuestaError' },
        },
      },
    };
  }
  return respuestas;
};

const cuerpoDePeticion = (esquema: z.ZodType): RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema: esquemaJson(esquema) } },
});

const parametroToken = (descripcion: string): ParameterObject[] => [
  {
    name: 'token',
    in: 'query',
    required: true,
    description: descripcion,
    schema: { type: 'string', minLength: 1 },
  },
];

const seguridadApiKey: SecurityRequirementObject[] = [{ ApiKey: [] }];
const seguridadApiKeyYUsuario: SecurityRequirementObject[] = [{ ApiKey: [], Bearer: [] }];

/**
 * Construye el documento OpenAPI de la API para el ambiente configurado.
 */
export const documentoOpenApi = (config: AppConfig): OpenAPIObject => {
  const raiz = prefijo(config);

  return {
    openapi: '3.1.0',
    info: {
      title: 'Microservicio de login',
      version: `v${config.apiVersion}`,
      description: [
        'API de registro de cuentas, confirmacion de correo electronico e inicio de sesion de las',
        'aplicaciones de la Fundacion Valle del Lili.',
        '',
        'Todas las rutas de negocio cuelgan del prefijo versionado del ambiente en el que se',
        'publica el servicio. Las respuestas usan el formato estandar `message`, `error`, `code` y',
        '`data`, con `code` en cero cuando la operacion fue exitosa.',
        '',
        'Los clientes se identifican con la cabecera `X-API-Key`, que se obtiene una sola vez en el',
        'endpoint publico de registro de instalacion y se entrega en texto plano en esa respuesta.',
        'Los usuarios se autentican con el token de acceso en la cabecera `Authorization`.',
      ].join('\n'),
    },
    servers: [{ url: '/', description: `Ambiente ${config.ambiente}` }],
    tags: [
      { name: 'Servicio', description: 'Informacion y estado del servicio.' },
      { name: 'Instalaciones', description: 'Registro de credenciales de cliente.' },
      { name: 'Autenticacion', description: 'Registro, confirmacion e inicio de sesion.' },
    ],
    components: {
      securitySchemes: {
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description:
            'Credencial del cliente. Se entrega una sola vez al registrar la instalacion y solo se ' +
            'almacena su hash SHA-256.',
        },
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token de acceso del usuario, con vigencia de 15 minutos.',
        },
      },
      schemas: {
        Error: ESQUEMA_ERROR,
        Usuario: ESQUEMA_USUARIO,
        Sesion: ESQUEMA_SESION,
        Respuesta: envolver(DATOS_LIBRES),
        RespuestaError: envolver(DATOS_NULOS),
        RespuestaSesion: envolver({
          type: 'object',
          properties: {
            token_acceso: ESQUEMA_TOKEN_ACCESO,
            token_refresh: ESQUEMA_TOKEN_REFRESH,
            token_type: ESQUEMA_TOKEN_TYPE,
            expires_in: ESQUEMA_EXPIRES_IN,
            refresh_expires_at: ESQUEMA_REFRESH_EXPIRES,
            usuario: ESQUEMA_USUARIO,
          },
          required: [
            'token_acceso',
            'token_refresh',
            'token_type',
            'expires_in',
            'refresh_expires_at',
            'usuario',
          ],
        }),
        RespuestaUsuario: envolver({
          type: 'object',
          properties: {
            usuario: ESQUEMA_USUARIO,
            correo_confirmacion_enviado: ESQUEMA_CORREO_ENVIADO,
          },
          required: ['usuario', 'correo_confirmacion_enviado'],
        }),
      },
    },
    paths: {
      '/': {
        get: {
          tags: ['Servicio'],
          summary: 'Informacion del servicio',
          description:
            'Responde siempre con el nombre del servicio, su version y el ambiente. La raiz nunca ' +
            'devuelve 404 para que el escaner de seguridad pueda evaluarla.',
          security: [],
          responses: {
            '200': {
              description: 'Servicio disponible.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Servicio'],
          summary: 'Estado de salud',
          description: 'Ruta usada por el healthcheck del contenedor.',
          security: [],
          responses: {
            '200': {
              description: 'Servicio saludable.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
          },
        },
      },
      [`${raiz}/installations/register`]: {
        post: {
          tags: ['Instalaciones'],
          summary: 'Registra la instalacion de un cliente',
          description:
            'Es la unica ruta que no exige API Key. Entrega la credencial del cliente en texto ' +
            'plano una sola vez: despues solo queda su hash SHA-256 en la base de datos.',
          security: [],
          requestBody: cuerpoDePeticion(instalacionSchema),
          responses: {
            '201': {
              description: 'Instalacion registrada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(ERRORES.validacion),
          },
        },
      },
      [`${raiz}/auth/register`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Registra una cuenta',
          description:
            'Crea la cuenta en estado por confirmar y envia el correo de confirmacion. Si no se ' +
            'aceptan los terminos y condiciones, la cuenta se crea igual pero no se envia el ' +
            'correo, de modo que no queda un registro a medio completar.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(registroSchema),
          responses: {
            '201': {
              description: 'Cuenta registrada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/RespuestaUsuario' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.usuarioYaExiste,
              ERRORES.rateLimit,
            ),
          },
        },
      },
      [`${raiz}/auth/login`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Inicia sesion',
          description:
            'Valida las credenciales y devuelve el token de acceso junto con el token de ' +
            'renovacion. Diez intentos fallidos consecutivos desactivar la cuenta.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(loginSchema),
          responses: {
            '200': {
              description: 'Sesion iniciada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/RespuestaSesion' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.credencialesInvalidas,
              ERRORES.cuentaPorConfirmar,
              ERRORES.cuentaInactiva,
              ERRORES.cuentaDesactivada,
              ERRORES.rateLimit,
            ),
          },
        },
      },
      [`${raiz}/auth/confirm-email`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Confirma el correo de la cuenta',
          description: 'Activa la cuenta que estaba en estado por confirmar.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(tokenSchema),
          responses: {
            '200': {
              description: 'Correo confirmado.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenInvalido,
              ERRORES.usuarioNoEncontrado,
              ERRORES.cuentaYaConfirmada,
            ),
          },
        },
        get: {
          tags: ['Autenticacion'],
          summary: 'Confirma el correo desde el enlace recibido',
          description: 'Variante del enlace que llega por correo electronico.',
          security: seguridadApiKey,
          parameters: parametroToken('Token de confirmacion recibido por correo.'),
          responses: {
            '200': {
              description: 'Correo confirmado.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenInvalido,
              ERRORES.usuarioNoEncontrado,
              ERRORES.cuentaYaConfirmada,
            ),
          },
        },
      },
      [`${raiz}/auth/refresh`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Renueva la sesion',
          description:
            'Entrega un token de acceso nuevo y rota el token de renovacion. El token anterior ' +
            'queda invalidado de inmediato.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(refreshSchema),
          responses: {
            '200': {
              description: 'Sesion renovada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/RespuestaSesion' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.sesionInvalida,
              ERRORES.usuarioNoEncontrado,
            ),
          },
        },
      },
      [`${raiz}/auth/logout`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Cierra la sesion',
          description:
            'Revoca la sesion del usuario. Es la unica respuesta que incluye la cabecera ' +
            'Clear-Site-Data.',
          security: seguridadApiKeyYUsuario,
          responses: {
            '200': {
              description: 'Sesion cerrada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenRequerido,
            ),
          },
        },
      },
      [`${raiz}/auth/forgot-password`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Solicita el reseteo de la contrasena',
          description:
            'Envia el enlace de reseteo al correo registrado. La respuesta es la misma exista o no ' +
            'la cuenta, para no revelar que correos estan registrados.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(emailSchema),
          responses: {
            '200': {
              description: 'Solicitud registrada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
            ),
          },
        },
      },
      [`${raiz}/auth/reset-password`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Define una nueva contrasena',
          description:
            'Consume el enlace de reseteo. El enlace es de un solo uso: en cuanto la contrasena ' +
            'cambia deja de servir.',
          security: seguridadApiKey,
          requestBody: cuerpoDePeticion(resetSchema),
          responses: {
            '200': {
              description: 'Contrasena actualizada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenInvalido,
            ),
          },
        },
        get: {
          tags: ['Autenticacion'],
          summary: 'Verifica el enlace de reseteo',
          description:
            'Valida el enlace sin cambiar la contrasena, para que el cliente web pueda mostrar el ' +
            'formulario antes de enviar el cambio.',
          security: seguridadApiKey,
          parameters: parametroToken('Token de reseteo recibido por correo.'),
          responses: {
            '200': {
              description: 'Enlace valido.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenInvalido,
            ),
          },
        },
      },
      [`${raiz}/auth/change-password`]: {
        post: {
          tags: ['Autenticacion'],
          summary: 'Cambia la contrasena con la sesion abierta',
          description:
            'Exige la contrasena actual y revoca las demas sesiones del usuario. La sesion actual ' +
            'se mantiene abierta.',
          security: seguridadApiKeyYUsuario,
          requestBody: cuerpoDePeticion(cambioSchema),
          responses: {
            '200': {
              description: 'Contrasena actualizada.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.validacion,
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenRequerido,
              ERRORES.passwordActualInvalida,
              ERRORES.usuarioNoEncontrado,
            ),
          },
        },
      },
      [`${raiz}/auth/me`]: {
        get: {
          tags: ['Autenticacion'],
          summary: 'Consulta los datos de la cuenta',
          description: 'Devuelve la informacion publica del usuario autenticado.',
          security: seguridadApiKeyYUsuario,
          responses: {
            '200': {
              description: 'Perfil consultado.',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Respuesta' } },
              },
            },
            ...respuestasDeError(
              ERRORES.apiKeyRequerida,
              ERRORES.apiKeyInvalida,
              ERRORES.apiKeySinPermiso,
              ERRORES.tokenRequerido,
              ERRORES.usuarioNoEncontrado,
            ),
          },
        },
      },
    },
  };
};
