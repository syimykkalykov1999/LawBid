// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReportReason {
  @JsonValue('spam')
  spam('spam'),
  @JsonValue('abuse')
  abuse('abuse'),
  @JsonValue('misinformation')
  misinformation('misinformation'),
  @JsonValue('impersonation')
  impersonation('impersonation'),
  @JsonValue('inappropriate')
  inappropriate('inappropriate'),
  @JsonValue('other')
  other('other'),
  @JsonValue('off_topic')
  offTopic('off_topic'),
  @JsonValue('conflict_of_interest')
  conflictOfInterest('conflict_of_interest'),
  @JsonValue('profanity')
  profanity('profanity'),
  @JsonValue('harassment')
  harassment('harassment'),
  @JsonValue('hate_speech')
  hateSpeech('hate_speech'),
  @JsonValue('personal_info')
  personalInfo('personal_info'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReportReason(this.json);

  factory ReportReason.fromJson(String json) =>
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
  static List<ReportReason> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
