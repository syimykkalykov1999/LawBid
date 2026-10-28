// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deal_case_dto.g.dart';

@JsonSerializable()
class DealCaseDto {
  const DealCaseDto({
    required this.title,
    required this.practice,
    required this.states,
  });

  factory DealCaseDto.fromJson(Map<String, Object?> json) =>
      _$DealCaseDtoFromJson(json);

  final String title;
  final String? practice;
  final List<String> states;

  Map<String, Object?> toJson() => _$DealCaseDtoToJson(this);
}
