// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_skipped_dto.g.dart';

@JsonSerializable()
class SfuSkippedDto {
  const SfuSkippedDto({
    required this.userId,
    required this.trackName,
    required this.reason,
  });

  factory SfuSkippedDto.fromJson(Map<String, Object?> json) =>
      _$SfuSkippedDtoFromJson(json);

  final String userId;

  /// mic, cam or * for all of that person.
  final String trackName;

  /// not_in_call | not_published | already_pulled | batch_limit | a Cloudflare error code.
  final String reason;

  Map<String, Object?> toJson() => _$SfuSkippedDtoToJson(this);
}
