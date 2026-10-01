// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum FilePurpose {
  @JsonValue('avatar')
  avatar('avatar'),
  @JsonValue('post_image')
  postImage('post_image'),
  @JsonValue('verification_document')
  verificationDocument('verification_document'),
  @JsonValue('verification_selfie')
  verificationSelfie('verification_selfie'),
  @JsonValue('post_video')
  postVideo('post_video'),
  @JsonValue('data_export')
  dataExport('data_export'),
  @JsonValue('case_photo')
  casePhoto('case_photo'),
  @JsonValue('case_attachment')
  caseAttachment('case_attachment'),
  @JsonValue('chat_voice')
  chatVoice('chat_voice'),
  @JsonValue('chat_attachment')
  chatAttachment('chat_attachment'),
  @JsonValue('task_attachment')
  taskAttachment('task_attachment'),
  @JsonValue('review_photo')
  reviewPhoto('review_photo'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const FilePurpose(this.json);

  factory FilePurpose.fromJson(String json) =>
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
  static List<FilePurpose> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
