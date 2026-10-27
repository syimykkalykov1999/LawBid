import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { Socket } from 'socket.io';

/** Socket.IO namespace of the staff desk (plan B2), separate from `/realtime`. */
export const STAFF_NAMESPACE = '/staff';

/**
 * Staff package (plan B2): the `/staff` namespace (presence heartbeat,
 * lease:* and offer:* events, team tiles). T1 only registers it: every
 * connection is closed at once with `staff:error` NOT_ENABLED, so nothing
 * listens, nothing is stored and `realtime.gateway.ts` is untouched. T3
 * adds the admin JWT + session check and the events behind
 * `staff.presence_enabled` / `staff.lease_enabled`.
 */
@WebSocketGateway({
  namespace: STAFF_NAMESPACE,
  cors: { origin: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 4 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectTimeout: 10_000,
})
export class StaffGateway implements OnGatewayConnection {
  handleConnection(socket: Socket): void {
    socket.emit('staff:error', { code: 'NOT_ENABLED' });
    socket.disconnect(true);
  }
}
