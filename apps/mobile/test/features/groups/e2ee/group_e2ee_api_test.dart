import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_api.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// G2b (design §4.3): a GroupInfo above `groups.e2ee_group_info_inline_kb`
/// goes as a file. The server answers 400 `why: use_file`; the app uploads
/// the GroupInfo through the encrypted-file upload (`chat_e2ee`) and sends
/// only its id — and for that group uploads first from then on.
void main() {
  test('a GroupInfo over the inline limit goes as a file, then always',
      () async {
    final client = _Client(limit: 8);
    final uploads = <List<int>>[];
    final g = ClientGroupE2eeApi(
      client,
      upload: (body, purpose) async {
        expect(purpose, api.FilePurpose.chatE2ee);
        final bytes = <int>[];
        await for (final c in body.open()) {
          bytes.addAll(c);
        }
        uploads.add(bytes);
        return 'file-${uploads.length}';
      },
    );
    final small = base64Encode(List.filled(4, 1));
    final big = base64Encode(List.filled(32, 2));

    expect(await g.postCommit('g1', _body(small)), 1);
    expect(client.sent.last, (inline: small, fileId: null));
    expect(uploads, isEmpty);

    expect(await g.postCommit('g1', _body(big)), 1);
    expect(client.sent.last, (inline: null, fileId: 'file-1'));
    expect(uploads.single, List.filled(32, 2));
    final refused = client.sent.length;

    // The same group again: the file first, no refused round trip.
    await g.externalCommit(
      'g1',
      GroupExternalCommitBody(
        deviceId: 'd',
        epoch: 1,
        commit: 'c',
        groupInfo: big,
      ),
    );
    expect(client.sent.length, refused + 1);
    expect(client.sent.last, (inline: null, fileId: 'file-2'));
  });

  test('another refusal is not turned into an upload', () async {
    final client = _Client(limit: 8, failWith: 409);
    final g = ClientGroupE2eeApi(
      client,
      upload: (_, __) async => fail('no upload'),
    );
    await expectLater(
      g.postCommit('g1', _body(base64Encode(List.filled(32, 2)))),
      throwsA(isA<DioException>()),
    );
  });
}

GroupCommitBody _body(String info) => GroupCommitBody(
      deviceId: 'd',
      epoch: 0,
      commit: 'c',
      groupInfo: info,
    );

class _Client implements api.E2eeClient {
  _Client({required this.limit, this.failWith});

  /// The server's inline limit in bytes (the setting is in KiB).
  final int limit;
  final int? failWith;
  final List<({String? inline, String? fileId})> sent = [];

  Never _refuse(int status, Map<String, Object?> details) => throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: status,
          data: {
            'error': {
              'code': 'VALIDATION_ERROR',
              'message': 'refused',
              'details': details,
            },
          },
        ),
      );

  void _check(String? inline, String? fileId) {
    sent.add((inline: inline, fileId: fileId));
    if (failWith != null) _refuse(failWith!, {});
    if (inline != null && base64Decode(inline).length > limit) {
      _refuse(400, {'field': 'groupInfo', 'why': 'use_file', 'maxKb': 1});
    }
  }

  @override
  Future<api.MlsEpochEnvelope> postGroupMlsCommit({
    required String id,
    required api.GroupMlsCommitDto body,
    Map<String, dynamic>? extras,
  }) async {
    _check(body.groupInfo, body.groupInfoFileId);
    return const api.MlsEpochEnvelope(data: api.MlsEpochDto(epoch: 1));
  }

  @override
  Future<api.MlsEpochEnvelope> postGroupExternalCommit({
    required String id,
    required api.GroupExternalCommitDto body,
    Map<String, dynamic>? extras,
  }) async {
    _check(body.groupInfo, body.groupInfoFileId);
    return const api.MlsEpochEnvelope(data: api.MlsEpochDto(epoch: 2));
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}
