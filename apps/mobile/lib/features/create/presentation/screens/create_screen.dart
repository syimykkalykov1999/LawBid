import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/create_case_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_editor_screen.dart';

/// The "+" full-screen creation flow (file 07 §3.4). Clients (OQ-038): a
/// new case (docs/04) or a post. Attorneys (owner 2026-09-30): a post or
/// News in a qualification.
class CreateScreen extends ConsumerStatefulWidget {
  const CreateScreen({super.key});

  @override
  ConsumerState<CreateScreen> createState() => _CreateScreenState();
}

// OQ-048: [task] — the attorney's own task or an assistant's task for them.
// Owner 2026-10-01: News is a switch inside the post, not its own entry.
enum _Kind { caseKind, post, task }

class _CreateScreenState extends ConsumerState<CreateScreen> {
  _Kind? _kind;

  @override
  Widget build(BuildContext context) {
    final attorney = ref.watch(currentUserRoleProvider) != UserRole.client;
    return switch (_kind) {
      _Kind.caseKind => const CreateCaseScreen(),
      _Kind.post => const CreatePostScreen(),
      _Kind.task => const TaskEditorScreen(),
      null => _Chooser(
          attorney: attorney,
          onPick: (k) => setState(() => _kind = k),
        ),
    };
  }
}

class _Chooser extends ConsumerWidget {
  const _Chooser({required this.onPick, required this.attorney});

  final ValueChanged<_Kind> onPick;
  final bool attorney;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final assistant = ref.watch(isAssistantProvider);
    final canTask = ref.watch(canDoProvider(AssistantDuty.tasks));
    final canPost = ref.watch(canDoProvider(AssistantDuty.posts)) ||
        ref.watch(canDoProvider(AssistantDuty.publish));
    final direct = ref.watch(canDoProvider(AssistantDuty.publish));

    Widget option(_Kind kind, IconData icon, String title, String sub) =>
        Semantics(
          button: true,
          label: '$title. $sub',
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onPick(kind),
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: colors.goldTint,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.goldStroke),
                    ),
                    child: AppIcon(icon, color: colors.goldDark, size: 28),
                  ),
                  const SizedBox(width: AppSpacing.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title,
                            style:
                                type.titleMedium.copyWith(color: colors.text)),
                        const SizedBox(height: AppSpacing.xs),
                        Text(sub,
                            style: type.bodySmall
                                .copyWith(color: colors.textSecondary)),
                      ],
                    ),
                  ),
                  AppIcon(AppIcons.chevronRightRounded,
                      color: colors.textSecondary),
                ],
              ),
            ),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('create.title')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: assistant
            ? [
                if (canTask) ...[
                  option(_Kind.task, AppIcons.eventNoteOutlined,
                      t.t('assistant.plus.task'),
                      t.t('assistant.plus.task.hint')),
                  const SizedBox(height: AppSpacing.md),
                ],
                if (canPost) ...[
                  option(
                      _Kind.post,
                      AppIcons.editNoteRounded,
                      t.t('create.post'),
                      t.t(direct
                          ? 'create.post.subAttorney'
                          : 'assistant.plus.post.hint')),
                ],
              ]
            : attorney
            ? [
                option(_Kind.post, AppIcons.editNoteRounded, t.t('create.post'),
                    t.t('create.post.subAttorney')),
                const SizedBox(height: AppSpacing.md),
                option(_Kind.task, AppIcons.eventNoteOutlined,
                    t.t('tasks.forMe'), t.t('assistant.plus.task.hint')),
              ]
            : [
                option(_Kind.caseKind, AppIcons.gavelRounded, t.t('create.case'),
                    t.t('create.case.sub')),
                const SizedBox(height: AppSpacing.md),
                option(_Kind.post, AppIcons.editNoteRounded, t.t('create.post'),
                    t.t('create.post.sub')),
                const SizedBox(height: AppSpacing.md),
                // Owner 2026-10-01: clients keep a planner too.
                option(_Kind.task, AppIcons.eventNoteOutlined,
                    t.t('tasks.forMe'), t.t('client.plus.task.hint')),
              ],
      ),
    );
  }
}
