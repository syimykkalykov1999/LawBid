// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_counts_dto.g.dart';

@JsonSerializable()
class AdminCountsDto {
  const AdminCountsDto({
    required this.verificationQueue,
    required this.openReports,
    required this.supportUnread,
    required this.trustQueue,
    required this.approvalsPending,
  });

  factory AdminCountsDto.fromJson(Map<String, Object?> json) =>
      _$AdminCountsDtoFromJson(json);

  /// Verification requests waiting.
  final int verificationQueue;

  /// Open reports.
  final int openReports;

  /// Support tickets unread by the team.
  final int supportUnread;

  /// Attorneys in the trust queue.
  final int trustQueue;

  /// Approvals this admin could decide.
  final int approvalsPending;

  Map<String, Object?> toJson() => _$AdminCountsDtoToJson(this);
}
