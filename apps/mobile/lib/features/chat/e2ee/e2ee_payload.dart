import 'dart:convert';
import 'dart:typed_data';

/// Item 25: what goes INSIDE an end-to-end encrypted chat message (the
/// MLS application data). The server sees none of it. Version 1: a text
/// with an optional reply and the «Forwarded» mark; files come as `file`.
class E2eePayload {
  const E2eePayload({
    required this.kind,
    this.body = '',
    this.replyToId,
    this.forwarded = false,
    this.extra = const {},
  });

  factory E2eePayload.fromJson(Map<String, dynamic> j) => E2eePayload(
        kind: j['t'] as String? ?? 'text',
        body: j['b'] as String? ?? '',
        replyToId: j['r'] as String?,
        forwarded: j['f'] == true,
        extra: {
          for (final e in j.entries)
            if (!const {'v', 't', 'b', 'r', 'f'}.contains(e.key))
              e.key: e.value,
        },
      );

  factory E2eePayload.decode(List<int> bytes) => E2eePayload.fromJson(
        jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>,
      );

  /// `text`, or `file` (an encrypted attachment).
  final String kind;
  final String body;
  final String? replyToId;
  final bool forwarded;

  /// Fields of other kinds, kept as they came (an older app shows the body
  /// it knows).
  final Map<String, Object?> extra;

  static const version = 1;

  Map<String, Object?> toJson() => {
        'v': version,
        't': kind,
        if (body.isNotEmpty) 'b': body,
        if (replyToId != null) 'r': replyToId,
        if (forwarded) 'f': true,
        ...extra,
      };

  Uint8List encode() => Uint8List.fromList(utf8.encode(jsonEncode(toJson())));
}
