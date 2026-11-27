// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_info_result_dto.g.dart';

@JsonSerializable()
class GroupInfoResultDto {
  const GroupInfoResultDto({required this.epoch, this.groupInfo, this.url});

  factory GroupInfoResultDto.fromJson(Map<String, Object?> json) =>
      _$GroupInfoResultDtoFromJson(json);

  /// The epoch it describes.
  final num epoch;

  /// Base64 MLSMessage (mls_group_info), when kept inline.
  final String? groupInfo;

  /// A short link to the file holding it, when bigger.
  final String? url;

  Map<String, Object?> toJson() => _$GroupInfoResultDtoToJson(this);
}
