// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'delete_push_token_dto.g.dart';

@JsonSerializable()
class DeletePushTokenDto {
  const DeletePushTokenDto({required this.token});

  factory DeletePushTokenDto.fromJson(Map<String, Object?> json) =>
      _$DeletePushTokenDtoFromJson(json);

  final String token;

  Map<String, Object?> toJson() => _$DeletePushTokenDtoToJson(this);
}
