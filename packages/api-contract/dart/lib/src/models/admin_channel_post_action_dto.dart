// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_post_action_dto_action.dart';

part 'admin_channel_post_action_dto.g.dart';

@JsonSerializable()
class AdminChannelPostActionDto {
  const AdminChannelPostActionDto({required this.action, this.reason = ''});

  factory AdminChannelPostActionDto.fromJson(Map<String, Object?> json) =>
      _$AdminChannelPostActionDtoFromJson(json);

  final AdminChannelPostActionDtoAction action;
  final String reason;

  Map<String, Object?> toJson() => _$AdminChannelPostActionDtoToJson(this);
}
