// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_commit_row_dto.g.dart';

@JsonSerializable()
class MlsCommitRowDto {
  const MlsCommitRowDto({
    required this.epoch,
    required this.senderDeviceId,
    required this.commit,
    required this.addedDevices,
    required this.removedDevices,
    required this.createdAt,
  });

  factory MlsCommitRowDto.fromJson(Map<String, Object?> json) =>
      _$MlsCommitRowDtoFromJson(json);

  final num epoch;
  final String senderDeviceId;

  /// Base64 MLSMessage.
  final String commit;
  final List<String> addedDevices;
  final List<String> removedDevices;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$MlsCommitRowDtoToJson(this);
}
