import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/case/:id` (the `lawbid.app/case/:id` deep link, docs/01 §12): the
/// owner sees their case, an attorney the attorney view (§4.3).
class CaseRouteScreen extends ConsumerWidget {
  const CaseRouteScreen({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(currentUserRoleProvider) == UserRole.client
          ? OwnerCaseScreen(caseId: caseId)
          : AttorneyCaseScreen(caseId: caseId);
}
