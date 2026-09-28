// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'profile_counters_dto.g.dart';

@JsonSerializable()
class ProfileCountersDto {
  const ProfileCountersDto({
    required this.posts,
    required this.followers,
    required this.following,
  });

  factory ProfileCountersDto.fromJson(Map<String, Object?> json) =>
      _$ProfileCountersDtoFromJson(json);

  final num posts;
  final num followers;
  final num following;

  Map<String, Object?> toJson() => _$ProfileCountersDtoToJson(this);
}
