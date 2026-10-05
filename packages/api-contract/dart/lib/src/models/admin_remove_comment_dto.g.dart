// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_remove_comment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRemoveCommentDto _$AdminRemoveCommentDtoFromJson(
  Map<String, dynamic> json,
) => AdminRemoveCommentDto(
  thread: AdminCommentThread.fromJson(json['thread'] as String),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminRemoveCommentDtoToJson(
  AdminRemoveCommentDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'thread': instance.thread.toJson(),
};
