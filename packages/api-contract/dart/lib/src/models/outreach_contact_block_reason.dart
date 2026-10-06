// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Why a call is blocked now; null = allowed.
@JsonEnum()
enum OutreachContactBlockReason {
  @JsonValue('dnc')
  dnc('dnc'),
  @JsonValue('client_disabled')
  clientDisabled('client_disabled'),
  @JsonValue('hours')
  hours('hours'),
  @JsonValue('unsubscribed')
  unsubscribed('unsubscribed'),
  @JsonValue('email_limit')
  emailLimit('email_limit'),
  @JsonValue('email_cooldown')
  emailCooldown('email_cooldown'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const OutreachContactBlockReason(this.json);

  factory OutreachContactBlockReason.fromJson(String json) =>
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
  static List<OutreachContactBlockReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
