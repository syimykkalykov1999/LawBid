// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consultation_person_dto.g.dart';

@JsonSerializable()
class ConsultationPersonDto {
  const ConsultationPersonDto({
    required this.id,
    required this.displayName,
    this.username,
    this.avatarUrl,
  });

  factory ConsultationPersonDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationPersonDtoFromJson(json);

  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;

  Map<String, Object?> toJson() => _$ConsultationPersonDtoToJson(this);
}
