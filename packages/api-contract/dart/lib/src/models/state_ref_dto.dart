// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'state_ref_dto.g.dart';

@JsonSerializable()
class StateRefDto {
  const StateRefDto({required this.code, required this.name});

  factory StateRefDto.fromJson(Map<String, Object?> json) =>
      _$StateRefDtoFromJson(json);

  final String code;
  final String name;

  Map<String, Object?> toJson() => _$StateRefDtoToJson(this);
}
