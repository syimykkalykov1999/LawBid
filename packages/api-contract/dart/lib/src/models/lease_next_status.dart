// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// leased = a new item is yours; busy = your hands are full (see `held`); empty = nothing waits; wrap_up = wait `retryAfterSec`; away / offline = come back online first.
@JsonEnum()
enum LeaseNextStatus {
  @JsonValue('leased')
  leased('leased'),
  @JsonValue('busy')
  busy('busy'),
  @JsonValue('empty')
  empty('empty'),
  @JsonValue('wrap_up')
  wrapUp('wrap_up'),
  @JsonValue('away')
  away('away'),
  @JsonValue('offline')
  offline('offline'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const LeaseNextStatus(this.json);

  factory LeaseNextStatus.fromJson(String json) =>
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
  static List<LeaseNextStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
