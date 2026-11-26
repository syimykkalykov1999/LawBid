import { SOCKET_SERVER_ORIGIN_OPTIONS } from './socket-origin';

/**
 * The options of THE Socket.IO server (one per process, shared by every
 * namespace: /realtime, /admin, /qr, /staff and the hotline handlers).
 *
 * Nest's SocketServerProvider keeps one server per port: the gateway that is
 * connected first creates it with its own decorator options, every later
 * gateway only adds its namespace (`server.of(ns)`) and its server-level
 * options are dropped silently. HotlineModule is imported before
 * RealtimeGatewayModule in app.module.ts, so before this file the hotline
 * gateway (no options) built the server and the 64 KB frame limit, the
 * ping/connect timeouts, the transports and the Origin check written on the
 * realtime gateway never applied on prod (engine.io defaults: 1 MB frames,
 * any Origin).
 *
 * So every @WebSocketGateway spreads this one constant and nothing else
 * server-level: whichever gateway starts first, the server is the same.
 * apps/api/test/socket-server-options.e2e-spec.ts proves it on the real
 * AppModule.
 *
 * maxHttpBufferSize is engine-wide (engine.io has no per-namespace limit),
 * so it is the largest frame any namespace needs: /realtime carries a call's
 * SDP/ICE of a few KB; 64 KB (owner 2026-10-15). The 4 KB written on /admin,
 * /qr and /staff never took effect (the shared server had 1 MB); now all of
 * them get 64 KB, 16x tighter than what ran on prod.
 */
export const SOCKET_SERVER_OPTIONS = {
  // ASVS V4.4.2 (#6): the HTTP CORS allowlist, also for the handshake.
  ...SOCKET_SERVER_ORIGIN_OPTIONS,
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  // Owner 2026-10-15: limits so one heavy or broken client cannot hurt the
  // rest. Every socket event is small (join, typing, presence, a call's
  // SDP/ICE of a few KB); files go through the REST API, not the socket.
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
};
