// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_locale_detail_dto_locale.dart';
import 'admin_legal_version_dto.dart';

part 'admin_legal_locale_detail_dto.g.dart';

@JsonSerializable()
class AdminLegalLocaleDetailDto {
  const AdminLegalLocaleDetailDto({
    required this.locale,
    required this.current,
    required this.draft,
  });

  factory AdminLegalLocaleDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminLegalLocaleDetailDtoFromJson(json);

  final AdminLegalLocaleDetailDtoLocale locale;
  final AdminLegalVersionDto? current;
  final AdminLegalVersionDto? draft;

  Map<String, Object?> toJson() => _$AdminLegalLocaleDetailDtoToJson(this);
}
