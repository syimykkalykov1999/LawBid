// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum E2eeReportReason {
  @JsonValue('spam')
  spam('spam'),
  @JsonValue('abuse')
  abuse('abuse'),
  @JsonValue('harassment')
  harassment('harassment'),
  @JsonValue('hate_speech')
  hateSpeech('hate_speech'),
  @JsonValue('fraud')
  fraud('fraud'),
  @JsonValue('inappropriate')
  inappropriate('inappropriate'),
  @JsonValue('personal_info')
  personalInfo('personal_info'),
  @JsonValue('other')
  other('other'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const E2eeReportReason(this.json);

  factory E2eeReportReason.fromJson(String json) =>
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
  static List<E2eeReportReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
