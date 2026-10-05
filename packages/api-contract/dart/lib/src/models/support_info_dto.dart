// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_info_dto.g.dart';

@JsonSerializable()
class SupportInfoDto {
  const SupportInfoDto({
    required this.open,
    required this.alwaysOpen,
    required this.expectedReplyMinutes,
    this.opensAt,
  });

  factory SupportInfoDto.fromJson(Map<String, Object?> json) =>
      _$SupportInfoDtoFromJson(json);

  /// The team works now.
  final bool open;
  final bool alwaysOpen;

  /// Usual first answer time, minutes.
  final num expectedReplyMinutes;

  /// When the team is back (null while open).
  final DateTime? opensAt;

  Map<String, Object?> toJson() => _$SupportInfoDtoToJson(this);
}
