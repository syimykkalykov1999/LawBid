// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Slow mode: seconds a member who is not an admin waits between two own messages; 0 (or null) = off. Needs the «edit group info» right.
@JsonEnum()
enum UpdateGroupDtoSlowModeS {
  @JsonValue(0)
  value0(0),
  @JsonValue(10)
  value10(10),
  @JsonValue(30)
  value30(30),
  @JsonValue(60)
  value60(60),
  @JsonValue(300)
  value300(300),
  @JsonValue(900)
  value900(900),
  @JsonValue(3600)
  value3600(3600),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const UpdateGroupDtoSlowModeS(this.json);

  factory UpdateGroupDtoSlowModeS.fromJson(num json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final num? json;
  num toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to num. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as num;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<UpdateGroupDtoSlowModeS> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
