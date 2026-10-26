// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_text_row_dto.g.dart';

@JsonSerializable()
class I18nTextRowDto {
  const I18nTextRowDto({
    required this.key,
    required this.values,
    required this.edited,
  });

  factory I18nTextRowDto.fromJson(Map<String, Object?> json) =>
      _$I18nTextRowDtoFromJson(json);

  final String key;

  /// lang → text
  final Map<String, String> values;

  /// Languages whose text was changed in the admin.
  final List<String> edited;

  Map<String, Object?> toJson() => _$I18nTextRowDtoToJson(this);
}
