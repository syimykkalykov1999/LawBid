// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ice_server_dto.g.dart';

@JsonSerializable()
class IceServerDto {
  const IceServerDto({required this.urls, this.username, this.credential});

  factory IceServerDto.fromJson(Map<String, Object?> json) =>
      _$IceServerDtoFromJson(json);

  final List<String> urls;
  final String? username;
  final String? credential;

  Map<String, Object?> toJson() => _$IceServerDtoToJson(this);
}
