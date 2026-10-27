// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum InfraRequestDtoStatus {
  @JsonValue('requested')
  requested('requested'),
  @JsonValue('planning')
  planning('planning'),
  @JsonValue('planned')
  planned('planned'),
  @JsonValue('confirmed')
  confirmed('confirmed'),
  @JsonValue('applying')
  applying('applying'),
  @JsonValue('done')
  done('done'),
  @JsonValue('failed')
  failed('failed'),
  @JsonValue('expired')
  expired('expired'),
  @JsonValue('cancelled')
  cancelled('cancelled'),
  @JsonValue('dry_run')
  dryRun('dry_run'),
  @JsonValue('rolled_back')
  rolledBack('rolled_back'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const InfraRequestDtoStatus(this.json);

  factory InfraRequestDtoStatus.fromJson(String json) =>
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
  static List<InfraRequestDtoStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
