/**
 * Apply security headers to every HTTP response.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import helmet from 'helmet';
import type { RequestHandler } from 'express';

const features = [
  'accelerometer',
  'autoplay',
  'camera',
  'cross-origin-isolated',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'keyboard-map',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'publickey-credentials-get',
  'screen-wake-lock',
  'usb',
  'web-share',
  'xr-spatial-tracking',
  'clipboard-read',
  'clipboard-write',
  'gamepad',
  'hid',
  'idle-detection',
  'interest-cohort',
  'serial',
  'unload',
];

export const securityHeaders = (): RequestHandler[] => [
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    hidePoweredBy: true,
  }),
  (_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      [...features.map((feature) => `${feature}=()`), 'sync-xhr=(self)'].join(', '),
    );
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  },
];
