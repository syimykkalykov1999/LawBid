// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// passed = the random on-device liveness prompt was done; not_checked = no face detector on this device (manual shot); skipped = the attorney used «Take photo anyway» after the timeout (still the live camera).
@JsonEnum()
enum SelfieCaptureMetaDtoLiveness {
  @JsonValue('passed')
  passed('passed'),
  @JsonValue('not_checked')
  notChecked('not_checked'),
  @JsonValue('skipped')
  skipped('skipped'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const SelfieCaptureMetaDtoLiveness(this.json);

  factory SelfieCaptureMetaDtoLiveness.fromJson(String json) =>
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
  static List<SelfieCaptureMetaDtoLiveness> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
