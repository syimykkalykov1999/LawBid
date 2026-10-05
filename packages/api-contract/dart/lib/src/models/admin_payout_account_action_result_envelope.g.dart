// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payout_account_action_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPayoutAccountActionResultEnvelope
_$AdminPayoutAccountActionResultEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminPayoutAccountActionResultEnvelope(
      data: AdminPayoutAccountActionResultDto.fromJson(
        json['data'] as Map<String, dynamic>,
      ),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminPayoutAccountActionResultEnvelopeToJson(
  AdminPayoutAccountActionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
