// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dispute_case_dto.g.dart';

@JsonSerializable()
class DisputeCaseDto {
  const DisputeCaseDto({required this.reason});

  factory DisputeCaseDto.fromJson(Map<String, Object?> json) =>
      _$DisputeCaseDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$DisputeCaseDtoToJson(this);
}
