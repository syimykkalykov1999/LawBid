// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReportTargetType {
  @JsonValue('post')
  post('post'),
  @JsonValue('comment')
  comment('comment'),
  @JsonValue('case_comment')
  caseComment('case_comment'),
  @JsonValue('message')
  message('message'),
  @JsonValue('user')
  user('user'),
  @JsonValue('sticker_pack')
  stickerPack('sticker_pack'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReportTargetType(this.json);

  factory ReportTargetType.fromJson(String json) =>
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
  static List<ReportTargetType> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
