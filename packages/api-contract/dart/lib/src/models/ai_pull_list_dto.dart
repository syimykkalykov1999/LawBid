// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_pull_dto.dart';

part 'ai_pull_list_dto.g.dart';

@JsonSerializable()
class AiPullListDto {
  const AiPullListDto({required this.pulls, required this.error});

  factory AiPullListDto.fromJson(Map<String, Object?> json) =>
      _$AiPullListDtoFromJson(json);

  final List<AiPullDto> pulls;
  final String? error;

  Map<String, Object?> toJson() => _$AiPullListDtoToJson(this);
}
