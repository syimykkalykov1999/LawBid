// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_approvals_count_dto.g.dart';

@JsonSerializable()
class AdminApprovalsCountDto {
  const AdminApprovalsCountDto({
    required this.pending,
    required this.limitCents,
  });

  factory AdminApprovalsCountDto.fromJson(Map<String, Object?> json) =>
      _$AdminApprovalsCountDtoFromJson(json);

  /// Requests this admin could approve now.
  final int pending;

  /// billing.dual_approval_min_cents: from this amount on.
  final int limitCents;

  Map<String, Object?> toJson() => _$AdminApprovalsCountDtoToJson(this);
}
