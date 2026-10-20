// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_detail_dto.dart';
import 'group_join_result_dto_status.dart';

part 'group_join_result_dto.g.dart';

@JsonSerializable()
class GroupJoinResultDto {
  const GroupJoinResultDto({
    required this.status,
    required this.groupId,
    this.group,
  });

  factory GroupJoinResultDto.fromJson(Map<String, Object?> json) =>
      _$GroupJoinResultDtoFromJson(json);

  final GroupJoinResultDtoStatus status;
  final String groupId;

  /// The group, once I am in.
  final GroupDetailDto? group;

  Map<String, Object?> toJson() => _$GroupJoinResultDtoToJson(this);
}
