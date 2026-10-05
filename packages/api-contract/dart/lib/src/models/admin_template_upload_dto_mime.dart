// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AdminTemplateUploadDtoMime {
  /// Incorrect name has been replaced. Original name: `application/pdf`.
  @JsonValue('application/pdf')
  undefined0('application/pdf'),

  /// Incorrect name has been replaced. Original name: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  @JsonValue(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  undefined1(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),

  /// Incorrect name has been replaced. Original name: `application/msword`.
  @JsonValue('application/msword')
  undefined2('application/msword'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AdminTemplateUploadDtoMime(this.json);

  factory AdminTemplateUploadDtoMime.fromJson(String json) =>
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
  static List<AdminTemplateUploadDtoMime> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
