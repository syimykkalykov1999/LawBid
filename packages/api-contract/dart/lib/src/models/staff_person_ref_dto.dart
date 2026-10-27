// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_person_ref_dto.g.dart';

@JsonSerializable()
class StaffPersonRefDto {
  const StaffPersonRefDto({required this.adminId, required this.name});

  factory StaffPersonRefDto.fromJson(Map<String, Object?> json) =>
      _$StaffPersonRefDtoFromJson(json);

  final String? adminId;
  final String name;

  Map<String, Object?> toJson() => _$StaffPersonRefDtoToJson(this);
}
