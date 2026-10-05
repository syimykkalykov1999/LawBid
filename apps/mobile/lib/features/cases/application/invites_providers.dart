import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/data/invites_repository.dart';
import 'package:lawbid/features/cases/domain/case_invite.dart';

/// Owner 2026-10-05: client → attorney case invites.
final invitesRepositoryProvider = Provider<InvitesRepository>(
  (ref) => ApiInvitesRepository(ref.watch(dioProvider)),
);

/// The attorney's invites waiting for an answer.
final pendingInvitesProvider = FutureProvider.autoDispose<List<CaseInvite>>(
  (ref) => ref.watch(invitesRepositoryProvider).pending(),
);

/// Invites on the client's case.
final caseInvitesProvider =
    FutureProvider.autoDispose.family<List<CaseInvite>, String>(
  (ref, caseId) => ref.watch(invitesRepositoryProvider).forCase(caseId),
);
