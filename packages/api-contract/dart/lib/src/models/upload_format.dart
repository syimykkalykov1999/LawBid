// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum UploadFormat {
  @JsonValue('jpeg')
  jpeg('jpeg'),
  @JsonValue('png')
  png('png'),
  @JsonValue('heic')
  heic('heic'),
  @JsonValue('webp')
  webp('webp'),
  @JsonValue('gif')
  gif('gif'),
  @JsonValue('pdf')
  pdf('pdf'),
  @JsonValue('doc')
  doc('doc'),
  @JsonValue('docx')
  docx('docx'),
  @JsonValue('xls')
  xls('xls'),
  @JsonValue('xlsx')
  xlsx('xlsx'),
  @JsonValue('ppt')
  ppt('ppt'),
  @JsonValue('pptx')
  pptx('pptx'),
  @JsonValue('odt')
  odt('odt'),
  @JsonValue('ods')
  ods('ods'),
  @JsonValue('odp')
  odp('odp'),
  @JsonValue('rtf')
  rtf('rtf'),
  @JsonValue('txt')
  txt('txt'),
  @JsonValue('csv')
  csv('csv'),
  @JsonValue('mp4')
  mp4('mp4'),
  @JsonValue('mov')
  mov('mov'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const UploadFormat(this.json);

  factory UploadFormat.fromJson(String json) =>
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
  static List<UploadFormat> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
