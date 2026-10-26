import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/workspace/compose_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-19: the one way to add or edit a planner task — the
/// «Новая задача» sheet (title, checklist, file, date, reminder, case,
/// priority). The full editor with the grid of kinds is gone.
///
/// [existing]: the task to edit (prefilled; what the sheet does not show is
/// kept). New task: [caseId]/[caseTitle] preset the briefcase; a chat
/// ([conversationId]) and its [people] go onto the task as they are.
/// Returns true once the task is saved.
Future<bool> showPlannerTaskSheet(
  BuildContext context,
  WidgetRef ref, {
  TaskItem? existing,
  String? caseId,
  String? caseTitle,
  String? conversationId,
  List<TaskPerson> people = const [],
}) async {
  final t = ref.read(translatorProvider);
  final r = await showComposeSheet(
    context,
    mode: ComposeMode.planner,
    isAttorney: ref.read(currentUserRoleProvider) != UserRole.client,
    existing: existing,
    initialCaseId: caseId,
    initialCaseTitle: caseId == null ? null : caseTitle,
  );
  if (r == null) return false;
  try {
    if (existing == null) {
      await createPlannerTaskFrom(
        ref,
        r,
        conversationId: conversationId,
        people: people,
      );
    } else {
      await updatePlannerTaskFrom(ref, existing, r);
    }
    if (context.mounted) {
      showAppSnackBar(context, t.t('tasks.saved'));
    }
    return true;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
    return false;
  }
}

/// Owner 2026-10-19: `/tasks/new` and `/tasks/edit` (links, older callers)
/// open the sheet over the page they came from; closing it goes back there.
class PlannerTaskSheetLauncher extends ConsumerStatefulWidget {
  const PlannerTaskSheetLauncher({
    this.existing,
    this.editing = false,
    this.caseId,
    this.caseTitle,
    this.conversationId,
    this.people = const [],
    super.key,
  });

  final TaskItem? existing;

  /// `/tasks/edit` without a task: nothing to open.
  final bool editing;
  final String? caseId;
  final String? caseTitle;
  final String? conversationId;
  final List<TaskPerson> people;

  @override
  ConsumerState<PlannerTaskSheetLauncher> createState() =>
      _PlannerTaskSheetLauncherState();
}

class _PlannerTaskSheetLauncherState
    extends ConsumerState<PlannerTaskSheetLauncher> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  Future<void> _open() async {
    var saved = false;
    if (!widget.editing || widget.existing != null) {
      saved = await showPlannerTaskSheet(
        context,
        ref,
        existing: widget.existing,
        caseId: widget.caseId,
        caseTitle: widget.caseTitle,
        conversationId: widget.conversationId,
        people: widget.people,
      );
    }
    if (!mounted) return;
    final popped = await Navigator.of(context).maybePop(saved);
    // Opened as the first page (a link): the Planner lives in «Дела».
    if (!popped && mounted) GoRouter.of(context).go(AppRoutes.mine);
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
