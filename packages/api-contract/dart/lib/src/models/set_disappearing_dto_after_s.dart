// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Seconds a new message lives: 86400 (24 h), 604800 (7 d) or 7776000 (90 d); absent or null = off.
@JsonEnum()
enum SetDisappearingDtoAfterS {
  @JsonValue(86400)
  value86400(86400),
  @JsonValue(604800)
  value604800(604800),
  @JsonValue(7776000)
  value7776000(7776000),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SetDisappearingDtoAfterS(this.json);

  factory SetDisappearingDtoAfterS.fromJson(num json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final num? json;
  num toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to num. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as num;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<SetDisappearingDtoAfterS> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
