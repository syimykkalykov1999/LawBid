// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_deleted_dto.g.dart';

@JsonSerializable()
class CaseDeletedDto {
  const CaseDeletedDto({this.deleted = true});

  factory CaseDeletedDto.fromJson(Map<String, Object?> json) =>
      _$CaseDeletedDtoFromJson(json);

  final bool deleted;

  Map<String, Object?> toJson() => _$CaseDeletedDtoToJson(this);
}
