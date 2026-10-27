// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum StaffRatingStatus {
  @JsonValue('low_data')
  lowData('low_data'),
  @JsonValue('ok')
  ok('ok'),
  @JsonValue('yellow')
  yellow('yellow'),
  @JsonValue('red')
  red('red'),
  @JsonValue('green')
  green('green'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const StaffRatingStatus(this.json);

  factory StaffRatingStatus.fromJson(String json) =>
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
  static List<StaffRatingStatus> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
