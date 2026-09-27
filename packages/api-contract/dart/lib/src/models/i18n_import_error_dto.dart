// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'i18n_import_error_dto.g.dart';

@JsonSerializable()
class I18nImportErrorDto {
  const I18nImportErrorDto({
    required this.message,
    this.row,
    this.key,
    this.lang,
  });

  factory I18nImportErrorDto.fromJson(Map<String, Object?> json) =>
      _$I18nImportErrorDtoFromJson(json);

  /// 1-based row in the uploaded file.
  final int? row;
  final String? key;
  final String? lang;
  final String message;

  Map<String, Object?> toJson() => _$I18nImportErrorDtoToJson(this);
}
