import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';

const _upper = '746B3B2A-1C2D-4E5F-8A9B-0C1D2E3F4A5B';
const _lower = '746b3b2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({
        'data': {
          'id': _lower,
          'conversationId': 'conv',
          'groupId': null,
          'callerId': 'caller',
          'calleeId': 'callee',
          'status': 'declined',
          'outgoing': false,
          'peer': {'id': 'caller', 'kind': 'attorney'},
          'participants': <Object>[],
          'createdAt': '2026-11-04T09:00:00.000Z',
        },
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// R-377 (prod log 2026-11-04): «Отклонить» on the iPhone's CallKit screen
/// sent `POST /calls/746B3B2A-…/decline` — CallKit hands the call id back
/// as `UUID.uuidString`, UPPERCASE — and the server answered 404 (the call
/// is stored lowercase), so the caller kept ringing. Every call id goes to
/// the server lowercase, whatever the system UI reported.
void main() {
  late _Adapter adapter;
  late ApiCallsRepository repo;

  setUp(() {
    adapter = _Adapter();
    repo = ApiCallsRepository(
      Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter,
    );
  });

  test('decline sends the call id lowercase', () async {
    await repo.decline(_upper);
    expect(adapter.requests, hasLength(1));
    expect(adapter.requests.single.path, '/calls/$_lower/decline');
  });

  test('accept, end and get send the call id lowercase too', () async {
    await repo.accept(_upper);
    await repo.end(_upper, CallEndReason.hangup);
    await repo.get(_upper);
    expect(
      adapter.requests.map((r) => r.path),
      ['/calls/$_lower/accept', '/calls/$_lower/end', '/calls/$_lower'],
    );
  });

  test('a CallKit event id is read lowercase', () {
    expect(systemCallId(_upper), _lower);
    expect(systemCallId(_lower), _lower);
  });
}
