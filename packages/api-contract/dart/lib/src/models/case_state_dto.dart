// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_state_dto.g.dart';

@JsonSerializable()
class CaseStateDto {
  const CaseStateDto({required this.stateCode, required this.isPrimary});

  factory CaseStateDto.fromJson(Map<String, Object?> json) =>
      _$CaseStateDtoFromJson(json);

  final String stateCode;
  final bool isPrimary;

  Map<String, Object?> toJson() => _$CaseStateDtoToJson(this);
}
