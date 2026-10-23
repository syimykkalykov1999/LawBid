// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Owner 2026-10-23: `reel` (default, up to `video.reel_max_duration_sec`).
/// or `post` (a longer video post, up to `video.post_max_duration_sec`).
@JsonEnum()
enum CreateVideoUploadDtoKind {
  @JsonValue('reel')
  reel('reel'),
  @JsonValue('post')
  post('post'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const CreateVideoUploadDtoKind(this.json);

  factory CreateVideoUploadDtoKind.fromJson(String json) =>
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
  static List<CreateVideoUploadDtoKind> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
