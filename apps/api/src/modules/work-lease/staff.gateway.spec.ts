import type { Socket } from 'socket.io';
import { STAFF_NAMESPACE, StaffGateway } from './staff.gateway';

describe('StaffGateway `/staff` (staff package T1 stub)', () => {
  it('is its own namespace and closes every connection while not built', () => {
    expect(STAFF_NAMESPACE).toBe('/staff');
    const socket = { emit: jest.fn(), disconnect: jest.fn() };
    new StaffGateway().handleConnection(socket as unknown as Socket);
    expect(socket.emit).toHaveBeenCalledWith('staff:error', {
      code: 'NOT_ENABLED',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
