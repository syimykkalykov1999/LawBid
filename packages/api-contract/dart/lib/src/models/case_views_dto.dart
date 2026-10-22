// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_views_dto.g.dart';

@JsonSerializable()
class CaseViewsDto {
  const CaseViewsDto({required this.caseIds});

  factory CaseViewsDto.fromJson(Map<String, Object?> json) =>
      _$CaseViewsDtoFromJson(json);

  final List<String> caseIds;

  Map<String, Object?> toJson() => _$CaseViewsDtoToJson(this);
}
