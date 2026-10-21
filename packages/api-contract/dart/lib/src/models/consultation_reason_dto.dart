// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consultation_reason_dto.g.dart';

@JsonSerializable()
class ConsultationReasonDto {
  const ConsultationReasonDto({this.reason});

  factory ConsultationReasonDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationReasonDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$ConsultationReasonDtoToJson(this);
}
