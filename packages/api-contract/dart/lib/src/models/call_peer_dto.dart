// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_peer_dto_kind.dart';

part 'call_peer_dto.g.dart';

@JsonSerializable()
class CallPeerDto {
  const CallPeerDto({
    required this.id,
    required this.kind,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  factory CallPeerDto.fromJson(Map<String, Object?> json) =>
      _$CallPeerDtoFromJson(json);

  final String id;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final CallPeerDtoKind kind;

  Map<String, Object?> toJson() => _$CallPeerDtoToJson(this);
}
