// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reject_ai_pull_dto.g.dart';

@JsonSerializable()
class RejectAiPullDto {
  const RejectAiPullDto({this.reason});

  factory RejectAiPullDto.fromJson(Map<String, Object?> json) =>
      _$RejectAiPullDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$RejectAiPullDtoToJson(this);
}
