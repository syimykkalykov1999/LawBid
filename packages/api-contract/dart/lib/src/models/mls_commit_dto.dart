// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_commit_dto.g.dart';

@JsonSerializable()
class MlsCommitDto {
  const MlsCommitDto({
    required this.deviceId,
    required this.epoch,
    required this.commit,
    required this.addedDevices,
    required this.removedDevices,
    this.welcome,
  });

  factory MlsCommitDto.fromJson(Map<String, Object?> json) =>
      _$MlsCommitDtoFromJson(json);

  /// The committing device.
  final String deviceId;

  /// The epoch the commit was made in.
  final num epoch;

  /// Base64 MLSMessage with the commit (PublicMessage preferred: the server checks its adds).
  final String commit;
  final List<String> addedDevices;
  final List<String> removedDevices;

  /// Base64 MLSMessage (mls_welcome) for the added devices; required when any is added.
  final String? welcome;

  Map<String, Object?> toJson() => _$MlsCommitDtoToJson(this);
}
