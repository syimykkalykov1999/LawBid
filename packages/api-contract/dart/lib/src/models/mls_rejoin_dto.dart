// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_rejoin_dto.g.dart';

@JsonSerializable()
class MlsRejoinDto {
  const MlsRejoinDto({required this.deviceId});

  factory MlsRejoinDto.fromJson(Map<String, Object?> json) =>
      _$MlsRejoinDtoFromJson(json);

  /// My device that cannot join.
  final String deviceId;

  Map<String, Object?> toJson() => _$MlsRejoinDtoToJson(this);
}
