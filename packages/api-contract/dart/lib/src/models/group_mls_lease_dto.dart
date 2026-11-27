// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_mls_lease_dto.g.dart';

@JsonSerializable()
class GroupMlsLeaseDto {
  const GroupMlsLeaseDto({required this.deviceId});

  factory GroupMlsLeaseDto.fromJson(Map<String, Object?> json) =>
      _$GroupMlsLeaseDtoFromJson(json);

  /// My device asking.
  final String deviceId;

  Map<String, Object?> toJson() => _$GroupMlsLeaseDtoToJson(this);
}
