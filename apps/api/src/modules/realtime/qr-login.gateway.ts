import { Inject, Optional } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Socket } from 'socket.io';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { QR_LOGIN_TTL_SEC } from '../auth/services/qr-login.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { QR_LOGIN_NAMESPACE, qrRoom } from './realtime-publisher.service';

/** Same shape as the REST DTO (`qrId`: 16–64 URL-safe chars). */
const QR_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** Sockets one IP may open per hour (a browser opens one per code). */
const QR_SOCKETS_PER_IP_PER_HOUR = 300;

/**
 * Owner 2026-10-22 (systems checklist §1, QR sign-in): the website waits
 * on this namespace instead of polling every 10 s. No sign-in exists yet,
 * so the socket proves nothing: it only joins the room of the code it
 * shows (`qr:<qrId>`), hears `auth:qr_scanned` / `auth:qr_approved` /
 * `auth:qr_rejected` — status only, never a token — and then redeems the
 * approval through `POST /auth/qr/poll` with the `pollSecret` only the
 * browser holds (a phone camera that read the QR knows the id too; this
 * is why the payload carries nothing secret). One room per socket, no
 * client events accepted, a per-IP limit, and the socket is closed when
 * the code expires. `POST /auth/qr/poll` stays as the fallback.
 */
@WebSocketGateway({
  namespace: QR_LOGIN_NAMESPACE,
  cors: { origin: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 4 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class QrLoginGateway implements OnGatewayConnection {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
    @Optional() private readonly rateLimit?: RateLimitService,
  ) {
    this.logger.setContext(QrLoginGateway.name);
  }

  async handleConnection(socket: Socket): Promise<void> {
    // The browser only listens: any packet it sends ends the socket.
    // Registered before the first await, so an eager client cannot slip
    // a packet in while the handshake checks run.
    socket.use((_packet, next) => {
      socket.disconnect(true);
      next(new Error('read-only'));
    });
    const auth = socket.handshake.auth as { qrId?: unknown } | undefined;
    const qrId =
      typeof auth?.qrId === 'string'
        ? auth.qrId
        : typeof socket.handshake.query.qrId === 'string'
          ? socket.handshake.query.qrId
          : undefined;
    if (!qrId || !QR_ID.test(qrId)) {
      socket.emit('auth:error', { code: 'VALIDATION_ERROR' });
      socket.disconnect(true);
      return;
    }
    const ip = socket.handshake.address;
    if (this.rateLimit && ip) {
      const r = await this.rateLimit.consumeFixedWindow(
        ['qr-socket', 'ip', ip],
        QR_SOCKETS_PER_IP_PER_HOUR,
        3600,
      );
      if (!r.allowed) {
        socket.emit('auth:error', { code: 'RATE_LIMITED' });
        socket.disconnect(true);
        return;
      }
    }
    // A code that no longer exists (expired, redeemed) gets nothing here:
    // tell the browser at once so it asks for a fresh one.
    if (!(await this.redis.exists(`auth:qr:${qrId}`))) {
      socket.emit('auth:qr_expired', { qrId });
      socket.disconnect(true);
      return;
    }
    await socket.join(qrRoom(qrId));
    const timer = setTimeout(
      () => {
        socket.emit('auth:qr_expired', { qrId });
        socket.disconnect(true);
      },
      (QR_LOGIN_TTL_SEC + 5) * 1000,
    );
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
  }
}
