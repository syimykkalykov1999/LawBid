// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'email_template_locale_status_dto_locale.dart';

part 'email_template_locale_status_dto.g.dart';

@JsonSerializable()
class EmailTemplateLocaleStatusDto {
  const EmailTemplateLocaleStatusDto({
    required this.locale,
    required this.overridden,
    required this.active,
    this.updatedAt,
  });

  factory EmailTemplateLocaleStatusDto.fromJson(Map<String, Object?> json) =>
      _$EmailTemplateLocaleStatusDtoFromJson(json);

  final EmailTemplateLocaleStatusDtoLocale locale;
  final bool overridden;

  /// Override exists and is enabled.
  final bool active;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$EmailTemplateLocaleStatusDtoToJson(this);
}
