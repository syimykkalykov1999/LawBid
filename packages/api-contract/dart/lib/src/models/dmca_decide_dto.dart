// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_decision.dart';

part 'dmca_decide_dto.g.dart';

@JsonSerializable()
class DmcaDecideDto {
  const DmcaDecideDto({required this.action, this.note});

  factory DmcaDecideDto.fromJson(Map<String, Object?> json) =>
      _$DmcaDecideDtoFromJson(json);

  final DmcaDecision action;
  final String? note;

  Map<String, Object?> toJson() => _$DmcaDecideDtoToJson(this);
}
