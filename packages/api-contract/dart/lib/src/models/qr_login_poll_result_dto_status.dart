// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// pending: not scanned; scanned: the phone shows the confirm screen; approved: tokens below (once); rejected / expired: ask for a new code.
@JsonEnum()
enum QrLoginPollResultDtoStatus {
  @JsonValue('pending')
  pending('pending'),
  @JsonValue('scanned')
  scanned('scanned'),
  @JsonValue('rejected')
  rejected('rejected'),
  @JsonValue('expired')
  expired('expired'),
  @JsonValue('approved')
  approved('approved'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const QrLoginPollResultDtoStatus(this.json);

  factory QrLoginPollResultDtoStatus.fromJson(String json) =>
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
  static List<QrLoginPollResultDtoStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
