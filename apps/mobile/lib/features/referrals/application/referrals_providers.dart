import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/referrals/data/referrals_repository.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';

final referralsRepositoryProvider = Provider<ReferralsRepository>(
  (ref) => ReferralsRepository(ref.watch(dioProvider)),
);

final referralMeProvider = FutureProvider.autoDispose<ReferralMe>(
  (ref) => ref.watch(referralsRepositoryProvider).me(),
);
