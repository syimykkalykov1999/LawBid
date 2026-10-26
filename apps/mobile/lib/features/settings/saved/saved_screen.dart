import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/presentation/saved_chats_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/shared/domain/user_role.dart';

enum _Kind { cases, posts, chats }

/// Owner 2026-10-15: the client's «Saved» posts moved here from «Mine».
/// Owner 2026-10-20: and the messages, files and links kept from chats.
/// Owner 2026-10-22 (audit #4 §1): the one «Сохранённое» of both roles —
/// an attorney also sees the saved cases (same as the bookmark in «Мои»).
class SavedScreen extends ConsumerStatefulWidget {
  const SavedScreen({super.key});

  @override
  ConsumerState<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends ConsumerState<SavedScreen> {
  _Kind _kind = _Kind.posts;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final kinds = [
      if (ref.watch(currentUserRoleProvider) == UserRole.attorney) _Kind.cases,
      _Kind.posts,
      _Kind.chats,
    ];
    final kind = kinds.contains(_kind) ? _kind : _Kind.posts;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('mine.tab.saved')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const SizedBox(height: AppSpacing.sm),
            FilterChips<_Kind>(
              value: kind,
              options: [
                for (final k in kinds)
                  (
                    k,
                    t.t(
                      switch (k) {
                        _Kind.cases => 'mine.saved.cases',
                        _Kind.posts => 'mine.saved.posts',
                        _Kind.chats => 'inbox.tab.chats',
                      },
                    ),
                  ),
              ],
              onChanged: (v) => setState(() => _kind = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: SwipePages<_Kind>(
                value: kind,
                values: kinds,
                onChanged: (v) => setState(() => _kind = v),
                pageBuilder: (_, kind) => switch (kind) {
                  _Kind.cases => const SavedCasesGrid(),
                  _Kind.posts => const SavedPostsList(),
                  _Kind.chats => const SavedChatsView(),
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
