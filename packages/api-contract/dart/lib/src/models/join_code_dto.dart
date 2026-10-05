// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'join_code_dto.g.dart';

@JsonSerializable()
class JoinCodeDto {
  const JoinCodeDto({required this.code});

  factory JoinCodeDto.fromJson(Map<String, Object?> json) =>
      _$JoinCodeDtoFromJson(json);

  final String code;

  Map<String, Object?> toJson() => _$JoinCodeDtoToJson(this);
}
