// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'badges_dto.g.dart';

@JsonSerializable()
class BadgesDto {
  const BadgesDto({
    required this.chatsUnread,
    required this.notificationsUnread,
    required this.total,
  });

  factory BadgesDto.fromJson(Map<String, Object?> json) =>
      _$BadgesDtoFromJson(json);

  final num chatsUnread;
  final num notificationsUnread;
  final num total;

  Map<String, Object?> toJson() => _$BadgesDtoToJson(this);
}
