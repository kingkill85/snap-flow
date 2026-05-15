import { Hono } from 'hono';
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from '../services/oauth/metadata.ts';

export const wellKnownRoutes = new Hono();

function baseUrlOf(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

wellKnownRoutes.get('/.well-known/oauth-authorization-server', (c) => {
  return c.json(buildAuthServerMetadata(baseUrlOf(c.req.raw)));
});

wellKnownRoutes.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json(buildProtectedResourceMetadata(baseUrlOf(c.req.raw)));
});

export default wellKnownRoutes;
