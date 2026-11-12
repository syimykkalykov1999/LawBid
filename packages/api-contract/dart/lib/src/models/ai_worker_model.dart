// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// ai.assistant_model: the Claude model of the runs.
@JsonEnum()
enum AiWorkerModel {
  @JsonValue('claude-haiku-5-5')
  claudeHaiku55('claude-haiku-5-5'),
  @JsonValue('claude-sonnet-5-5')
  claudeSonnet55('claude-sonnet-5-5'),
  @JsonValue('claude-opus-5-5')
  claudeOpus55('claude-opus-5-5'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AiWorkerModel(this.json);

  factory AiWorkerModel.fromJson(String json) =>
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
  static List<AiWorkerModel> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
