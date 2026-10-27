// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_review_level.dart';

part 'review_me_dto.g.dart';

@JsonSerializable()
class ReviewMeDto {
  const ReviewMeDto({required this.level, required this.canManage});

  factory ReviewMeDto.fromJson(Map<String, Object?> json) =>
      _$ReviewMeDtoFromJson(json);

  final StaffReviewLevel level;

  /// May mark golden tasks and read stats and the team (owner, head).
  final bool canManage;

  Map<String, Object?> toJson() => _$ReviewMeDtoToJson(this);
}
