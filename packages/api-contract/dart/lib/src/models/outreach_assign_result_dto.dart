// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_assign_result_dto.g.dart';

@JsonSerializable()
class OutreachAssignResultDto {
  const OutreachAssignResultDto({required this.updated});

  factory OutreachAssignResultDto.fromJson(Map<String, Object?> json) =>
      _$OutreachAssignResultDtoFromJson(json);

  final num updated;

  Map<String, Object?> toJson() => _$OutreachAssignResultDtoToJson(this);
}
