// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'activity_status_dto.g.dart';

@JsonSerializable()
class ActivityStatusDto {
  const ActivityStatusDto({required this.showActivityStatus});

  factory ActivityStatusDto.fromJson(Map<String, Object?> json) =>
      _$ActivityStatusDtoFromJson(json);

  /// Others see when I am online / last seen; off = I see nobody's either.
  final bool showActivityStatus;

  Map<String, Object?> toJson() => _$ActivityStatusDtoToJson(this);
}
