// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum EconomyEventDtoKind {
  @JsonValue('guard_on')
  guardOn('guard_on'),
  @JsonValue('guard_off')
  guardOff('guard_off'),
  @JsonValue('ceiling')
  ceiling('ceiling'),
  @JsonValue('db_cpu')
  dbCpu('db_cpu'),
  @JsonValue('db_connections')
  dbConnections('db_connections'),
  @JsonValue('redis_memory')
  redisMemory('redis_memory'),
  @JsonValue('scaled_up')
  scaledUp('scaled_up'),
  @JsonValue('scaled_down')
  scaledDown('scaled_down'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const EconomyEventDtoKind(this.json);

  factory EconomyEventDtoKind.fromJson(String json) =>
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
  static List<EconomyEventDtoKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
