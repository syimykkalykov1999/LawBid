// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_consultation_dto.g.dart';

@JsonSerializable()
class CreateConsultationDto {
  const CreateConsultationDto({
    required this.attorneyId,
    required this.startsAt,
    this.note,
    this.caseId,
  });

  factory CreateConsultationDto.fromJson(Map<String, Object?> json) =>
      _$CreateConsultationDtoFromJson(json);

  final String attorneyId;
  final String startsAt;
  final String? note;

  /// One of the client's cases
  final String? caseId;

  Map<String, Object?> toJson() => _$CreateConsultationDtoToJson(this);
}
