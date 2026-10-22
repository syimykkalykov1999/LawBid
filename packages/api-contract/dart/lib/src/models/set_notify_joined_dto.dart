// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_notify_joined_dto.g.dart';

@JsonSerializable()
class SetNotifyJoinedDto {
  const SetNotifyJoinedDto({required this.enabled});

  factory SetNotifyJoinedDto.fromJson(Map<String, Object?> json) =>
      _$SetNotifyJoinedDtoFromJson(json);

  /// «Notify me when contacts join LawBid»: the server sends "X joined LawBid".
  final bool enabled;

  Map<String, Object?> toJson() => _$SetNotifyJoinedDtoToJson(this);
}
