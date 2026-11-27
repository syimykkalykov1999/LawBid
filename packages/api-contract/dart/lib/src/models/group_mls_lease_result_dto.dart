// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_mls_lease_result_dto.g.dart';

@JsonSerializable()
class GroupMlsLeaseResultDto {
  const GroupMlsLeaseResultDto({
    required this.granted,
    required this.ttlMs,
    this.holderDeviceId,
  });

  factory GroupMlsLeaseResultDto.fromJson(Map<String, Object?> json) =>
      _$GroupMlsLeaseResultDtoFromJson(json);

  /// My device holds the right to commit now.
  final bool granted;

  /// Who holds it (me when granted).
  final String? holderDeviceId;

  /// Milliseconds the right lasts from now.
  final num ttlMs;

  Map<String, Object?> toJson() => _$GroupMlsLeaseResultDtoToJson(this);
}
