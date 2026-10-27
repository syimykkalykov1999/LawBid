// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'minor_action_result_dto.g.dart';

@JsonSerializable()
class MinorActionResultDto {
  const MinorActionResultDto({required this.userId, required this.result});

  factory MinorActionResultDto.fromJson(Map<String, Object?> json) =>
      _$MinorActionResultDtoFromJson(json);

  final String userId;

  /// flagged | deleted | deletion_deferred | cleared
  final String result;

  Map<String, Object?> toJson() => _$MinorActionResultDtoToJson(this);
}
