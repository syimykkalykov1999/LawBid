// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'incident_contact_dto.g.dart';

@JsonSerializable()
class IncidentContactDto {
  const IncidentContactDto({required this.email, required this.phone});

  factory IncidentContactDto.fromJson(Map<String, Object?> json) =>
      _$IncidentContactDtoFromJson(json);

  final String email;
  final String phone;

  Map<String, Object?> toJson() => _$IncidentContactDtoToJson(this);
}
