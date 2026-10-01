// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_member_duties_dto_duties.dart';

part 'admin_member_duties_dto.g.dart';

@JsonSerializable()
class AdminMemberDutiesDto {
  const AdminMemberDutiesDto({required this.duties});

  factory AdminMemberDutiesDto.fromJson(Map<String, Object?> json) =>
      _$AdminMemberDutiesDtoFromJson(json);

  final List<AdminMemberDutiesDtoDuties> duties;

  Map<String, Object?> toJson() => _$AdminMemberDutiesDtoToJson(this);
}
