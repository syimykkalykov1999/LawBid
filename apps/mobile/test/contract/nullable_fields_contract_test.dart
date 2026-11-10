import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Sweep B-c9 (ST:34-35): the app reads the server's JSON through the
/// generated contract models, and these must survive the shapes the
/// contract allows: every `nullable` field null and every optional field
/// absent. Samples are built from packages/api-contract/openapi.json
/// itself, so a field that turns nullable on the server and is still read
/// as non-null here fails this test before it fails on a phone.
final Map<String, dynamic> _schemas = ((jsonDecode(
  File('../../packages/api-contract/openapi.json').readAsStringSync(),
) as Map<String, dynamic>)['components'] as Map<String, dynamic>)['schemas']
    as Map<String, dynamic>;

Map<String, dynamic> _resolve(Map<String, dynamic> s) {
  final ref = s[r'$ref'] as String?;
  if (ref != null) {
    return _resolve(_schemas[ref.split('/').last] as Map<String, dynamic>);
  }
  final all = s['allOf'];
  if (all is List && all.length == 1) {
    return {
      ..._resolve(all.first as Map<String, dynamic>),
      if (s['nullable'] == true) 'nullable': true,
    };
  }
  return s;
}

/// The smallest value the contract allows: null where nullable, absent
/// where optional ([full] = false), a plain value otherwise.
Object? _sample(Map<String, dynamic> raw, {required bool full, int depth = 0}) {
  final s = _resolve(raw);
  if (!full && s['nullable'] == true) return null;
  final e = s['enum'];
  if (e is List && e.isNotEmpty) return e.first;
  switch (s['type']) {
    case 'string':
      return switch (s['format']) {
        'uuid' => '00000000-0000-4000-8000-000000000000',
        'date-time' => '2026-11-09T10:00:00.000Z',
        'date' => '2026-11-09',
        _ => 'x',
      };
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return false;
    case 'array':
      if (depth > 4) return <Object?>[];
      final item = s['items'];
      return full && item is Map<String, dynamic>
          ? [_sample(item, full: true, depth: depth + 1)]
          : <Object?>[];
    default:
      final props = s['properties'];
      if (props is! Map<String, dynamic>) return <String, Object?>{};
      final required = {...(s['required'] as List? ?? const [])};
      return <String, Object?>{
        for (final p in props.entries)
          if (full || required.contains(p.key))
            p.key: _sample(
              p.value as Map<String, dynamic>,
              full: full,
              depth: depth + 1,
            ),
      };
  }
}

Map<String, Object?> _of(String schema, {required bool full}) =>
    _sample(_schemas[schema] as Map<String, dynamic>, full: full)!
        as Map<String, Object?>;

void main() {
  // Every model the app's own parsers go through (sweep B-c9 list).
  final models = <String, Object Function(Map<String, Object?>)>{
    'SessionDto': api.SessionDto.fromJson,
    'I18nLanguageDto': api.I18nLanguageDto.fromJson,
    'I18nBundleDto': api.I18nBundleDto.fromJson,
    'CallDto': api.CallDto.fromJson,
    'CallParticipantDto': api.CallParticipantDto.fromJson,
    'CallVoteDto': api.CallVoteDto.fromJson,
    'CallMediaFallbackDto': api.CallMediaFallbackDto.fromJson,
    'GroupDetailDto': api.GroupDetailDto.fromJson,
    'GroupMemberDto': api.GroupMemberDto.fromJson,
    'GroupPersonDto': api.GroupPersonDto.fromJson,
    'PollVoterOptionDto': api.PollVoterOptionDto.fromJson,
  };

  for (final m in models.entries) {
    test('${m.key}: nullable fields null, optional fields absent', () {
      expect(() => m.value(_of(m.key, full: false)), returnsNormally);
    });
    test('${m.key}: every field present', () {
      expect(() => m.value(_of(m.key, full: true)), returnsNormally);
    });
  }

  test('the app parsers on top of them: sessions, languages, bundle', () {
    final s = DeviceSession.fromDto(
      api.SessionDto.fromJson(_of('SessionDto', full: false)),
    );
    expect(s.deviceId, isNull);
    expect(s.lastUsedAt, isNull);
    final l = I18nLanguageDto.fromJson(_of('I18nLanguageDto', full: false));
    expect(l.code, 'x');
    final b = I18nBundleResult.fromJson(_of('I18nBundleDto', full: false));
    expect(b.translations, isEmpty);
  });

  test('realtime call payloads: a null / odd hostId does not drop the event',
      () {
    final p = _of('CallParticipantDto', full: false);
    for (final host in [null, 42, 'host-1']) {
      final r = CallMappers.participantsFromEvent({
        'callId': 'c1',
        'hostId': host,
        'participants': [p],
      });
      expect(r, isNotNull, reason: 'hostId = $host');
      expect(r!.hostId, host is String ? host : null);
      expect(r.members, hasLength(1));
    }
  });
}
