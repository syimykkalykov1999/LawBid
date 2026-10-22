import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';

/// Security research #5 (2026-10-22), A5: the server's `auth:error
/// { code: 'RATE_LIMITED' }` is not an expired token — the client waits
/// longer each time instead of refreshing and reconnecting at once.
void main() {
  test('only the RATE_LIMITED auth:error is a rate limit', () {
    expect(RealtimeClient.isRateLimited({'code': 'RATE_LIMITED'}), isTrue);
    expect(RealtimeClient.isRateLimited({'code': 'UNAUTHORIZED'}), isFalse);
    expect(RealtimeClient.isRateLimited(null), isFalse);
    expect(RealtimeClient.isRateLimited('RATE_LIMITED'), isFalse);
  });

  test('the wait doubles from 5 s and stops at a minute', () {
    expect(RealtimeClient.rateLimitDelay(0), const Duration(seconds: 5));
    expect(RealtimeClient.rateLimitDelay(1), const Duration(seconds: 10));
    expect(RealtimeClient.rateLimitDelay(2), const Duration(seconds: 20));
    expect(RealtimeClient.rateLimitDelay(3), const Duration(seconds: 40));
    expect(RealtimeClient.rateLimitDelay(4), const Duration(seconds: 60));
    expect(RealtimeClient.rateLimitDelay(20), const Duration(seconds: 60));
  });

  test('jitter moves the wait by at most a quarter', () {
    expect(
      RealtimeClient.rateLimitDelay(0, jitter: 1),
      const Duration(milliseconds: 6250),
    );
    expect(
      RealtimeClient.rateLimitDelay(0, jitter: -1),
      const Duration(milliseconds: 3750),
    );
    expect(
      RealtimeClient.rateLimitDelay(1, jitter: 5),
      const Duration(milliseconds: 12500),
    );
  });
}
