// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AdminSupportUploadDtoMime {
  /// Incorrect name has been replaced. Original name: `image/jpeg`.
  @JsonValue('image/jpeg')
  undefined0('image/jpeg'),

  /// Incorrect name has been replaced. Original name: `image/png`.
  @JsonValue('image/png')
  undefined1('image/png'),

  /// Incorrect name has been replaced. Original name: `image/heic`.
  @JsonValue('image/heic')
  undefined2('image/heic'),

  /// Incorrect name has been replaced. Original name: `application/pdf`.
  @JsonValue('application/pdf')
  undefined3('application/pdf'),

  /// Incorrect name has been replaced. Original name: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
  @JsonValue(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  undefined4(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ),

  /// Incorrect name has been replaced. Original name: `audio/mp4`.
  @JsonValue('audio/mp4')
  undefined5('audio/mp4'),

  /// Incorrect name has been replaced. Original name: `audio/webm`.
  @JsonValue('audio/webm')
  undefined6('audio/webm'),

  /// Incorrect name has been replaced. Original name: `image/webp`.
  @JsonValue('image/webp')
  undefined7('image/webp'),

  /// Incorrect name has been replaced. Original name: `image/gif`.
  @JsonValue('image/gif')
  undefined8('image/gif'),

  /// Incorrect name has been replaced. Original name: `application/msword`.
  @JsonValue('application/msword')
  undefined9('application/msword'),

  /// Incorrect name has been replaced. Original name: `application/vnd.ms-excel`.
  @JsonValue('application/vnd.ms-excel')
  undefined10('application/vnd.ms-excel'),

  /// Incorrect name has been replaced. Original name: `application/vnd.ms-powerpoint`.
  @JsonValue('application/vnd.ms-powerpoint')
  undefined11('application/vnd.ms-powerpoint'),

  /// Incorrect name has been replaced. Original name: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  @JsonValue(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  undefined12(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ),

  /// Incorrect name has been replaced. Original name: `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
  @JsonValue(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  )
  undefined13(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ),

  /// Incorrect name has been replaced. Original name: `application/vnd.oasis.opendocument.text`.
  @JsonValue('application/vnd.oasis.opendocument.text')
  undefined14('application/vnd.oasis.opendocument.text'),

  /// Incorrect name has been replaced. Original name: `application/vnd.oasis.opendocument.spreadsheet`.
  @JsonValue('application/vnd.oasis.opendocument.spreadsheet')
  undefined15('application/vnd.oasis.opendocument.spreadsheet'),

  /// Incorrect name has been replaced. Original name: `application/vnd.oasis.opendocument.presentation`.
  @JsonValue('application/vnd.oasis.opendocument.presentation')
  undefined16('application/vnd.oasis.opendocument.presentation'),

  /// Incorrect name has been replaced. Original name: `application/rtf`.
  @JsonValue('application/rtf')
  undefined17('application/rtf'),

  /// Incorrect name has been replaced. Original name: `text/plain`.
  @JsonValue('text/plain')
  undefined18('text/plain'),

  /// Incorrect name has been replaced. Original name: `text/csv`.
  @JsonValue('text/csv')
  undefined19('text/csv'),

  /// Incorrect name has been replaced. Original name: `video/mp4`.
  @JsonValue('video/mp4')
  undefined20('video/mp4'),

  /// Incorrect name has been replaced. Original name: `video/quicktime`.
  @JsonValue('video/quicktime')
  undefined21('video/quicktime'),

  /// Incorrect name has been replaced. Original name: `video/webm`.
  @JsonValue('video/webm')
  undefined22('video/webm'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AdminSupportUploadDtoMime(this.json);

  factory AdminSupportUploadDtoMime.fromJson(String json) =>
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
  static List<AdminSupportUploadDtoMime> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
