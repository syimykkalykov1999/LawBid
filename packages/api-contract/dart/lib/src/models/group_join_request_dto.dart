// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';

part 'group_join_request_dto.g.dart';

@JsonSerializable()
class GroupJoinRequestDto {
  const GroupJoinRequestDto({required this.user, required this.createdAt});

  factory GroupJoinRequestDto.fromJson(Map<String, Object?> json) =>
      _$GroupJoinRequestDtoFromJson(json);

  final GroupPersonDto user;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$GroupJoinRequestDtoToJson(this);
}
