import { Hono } from 'hono';
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from '../services/oauth/metadata.ts';
import { publicBaseUrl } from '../utils/public-url.ts';

export const wellKnownRoutes = new Hono();

wellKnownRoutes.get('/.well-known/oauth-authorization-server', (c) => {
  return c.json(buildAuthServerMetadata(publicBaseUrl(c)));
});

wellKnownRoutes.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json(buildProtectedResourceMetadata(publicBaseUrl(c)));
});

export default wellKnownRoutes;
