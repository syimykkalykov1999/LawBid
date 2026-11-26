// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// off = write as before (server-side encryption); pending = the first device may create the MLS group now; on = the chat is end-to-end encrypted (send type=mls).
@JsonEnum()
enum ConversationE2eeState {
  @JsonValue('off')
  off('off'),
  @JsonValue('pending')
  pending('pending'),

  /// The name has been replaced because it contains a keyword. Original name: `on`.
  @JsonValue('on')
  valueOn('on'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ConversationE2eeState(this.json);

  factory ConversationE2eeState.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ConversationE2eeState> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
