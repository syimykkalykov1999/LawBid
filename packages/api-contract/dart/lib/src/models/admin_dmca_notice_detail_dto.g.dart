// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dmca_notice_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDmcaNoticeDetailDto _$AdminDmcaNoticeDetailDtoFromJson(
  Map<String, dynamic> json,
) => AdminDmcaNoticeDetailDto(
  notice: AdminDmcaNoticeRowDto.fromJson(
    json['notice'] as Map<String, dynamic>,
  ),
  strikesToSuspend: (json['strikesToSuspend'] as num).toInt(),
  target: json['target'] == null
      ? null
      : ModerationCardDto.fromJson(json['target'] as Map<String, dynamic>),
  authorStrikes: (json['authorStrikes'] as num?)?.toInt(),
);

Map<String, dynamic> _$AdminDmcaNoticeDetailDtoToJson(
  AdminDmcaNoticeDetailDto instance,
) => <String, dynamic>{
  'notice': instance.notice.toJson(),
  'target': ?instance.target?.toJson(),
  'authorStrikes': ?instance.authorStrikes,
  'strikesToSuspend': instance.strikesToSuspend,
};
