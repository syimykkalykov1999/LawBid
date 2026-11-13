// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'approve_ai_pull_dto.g.dart';

@JsonSerializable()
class ApproveAiPullDto {
  const ApproveAiPullDto({required this.headSha});

  factory ApproveAiPullDto.fromJson(Map<String, Object?> json) =>
      _$ApproveAiPullDtoFromJson(json);

  /// The head sha the owner saw; the merge is pinned to it.
  final String headSha;

  Map<String, Object?> toJson() => _$ApproveAiPullDtoToJson(this);
}
