// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_assign_dto.g.dart';

@JsonSerializable()
class OutreachAssignDto {
  const OutreachAssignDto({required this.leadIds, required this.partnerId});

  factory OutreachAssignDto.fromJson(Map<String, Object?> json) =>
      _$OutreachAssignDtoFromJson(json);

  final List<String> leadIds;
  final String? partnerId;

  Map<String, Object?> toJson() => _$OutreachAssignDtoToJson(this);
}
