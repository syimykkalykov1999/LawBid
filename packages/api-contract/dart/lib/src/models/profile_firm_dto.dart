// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'profile_firm_dto.g.dart';

@JsonSerializable()
class ProfileFirmDto {
  const ProfileFirmDto({
    required this.id,
    required this.name,
  });
  
  factory ProfileFirmDto.fromJson(Map<String, Object?> json) => _$ProfileFirmDtoFromJson(json);
  
  final String id;
  final String name;

  Map<String, Object?> toJson() => _$ProfileFirmDtoToJson(this);
}
