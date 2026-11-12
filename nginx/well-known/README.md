Archivos de verificacion de enlaces de app y universal.

El equipo de la aplicacion movil coloca aqui dos archivos, que el dominio del backend sirve en
`/.well-known/`. Son los que permiten que el enlace de confirmacion de correo y el de reseteo de
contrasena abran la aplicacion en lugar del navegador.

## assetlinks.json (Android)

Nombre exacto del archivo, sin extension:

    assetlinks.json

Estructura esperada:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "co.org.fvl.login",
      "sha256_cert_fingerprints": ["HUELLA_SHA256_DEL_CERTIFICADO_DE_FIRMA"]
    }
  }
]
```

La huella se obtiene del certificado de firma de la aplicacion en distribucion.

## apple-app-site-association (iOS)

Nombre exacto del archivo, **sin extension**:

    apple-app-site-association

Estructura esperada:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "EQUIPO.co.org.fvl.login",
        "paths": ["/backend/*/v*/auth/*"]
      }
    ]
  }
}
```

Limitar `paths` a las rutas del flujo de autenticacion evita que cualquier otra direccion del
backend abra la aplicacion.
