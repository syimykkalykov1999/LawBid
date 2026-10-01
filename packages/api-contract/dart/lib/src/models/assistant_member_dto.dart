// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_member_dto_approval.dart';
import 'assistant_member_dto_status.dart';

part 'assistant_member_dto.g.dart';

@JsonSerializable()
class AssistantMemberDto {
  const AssistantMemberDto({
    required this.id,
    required this.phone,
    required this.status,
    required this.approval,
    required this.duties,
    required this.createdAt,
    this.name,
    this.joinedAt,
    this.liabilityAcceptedAt,
  });

  factory AssistantMemberDto.fromJson(Map<String, Object?> json) =>
      _$AssistantMemberDtoFromJson(json);

  final String id;
  final String phone;
  final String? name;
  final AssistantMemberDtoStatus status;
  final AssistantMemberDtoApproval approval;
  final List<String> duties;
  final String? joinedAt;
  final String createdAt;

  /// OQ-049: when the attorney last accepted responsibility for this assistant ("bids" / "publish").
  final String? liabilityAcceptedAt;

  Map<String, Object?> toJson() => _$AssistantMemberDtoToJson(this);
}
