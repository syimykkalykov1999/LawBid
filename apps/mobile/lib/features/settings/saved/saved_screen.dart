import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/presentation/saved_chats_view.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';

enum _Kind { posts, chats }

/// Owner 2026-10-15: the client's «Saved» posts moved here from «Mine».
/// Owner 2026-10-20: and the messages, files and links kept from chats.
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
              value: _kind,
              options: [
                (_Kind.posts, t.t('mine.saved.posts')),
                (_Kind.chats, t.t('inbox.tab.chats')),
              ],
              onChanged: (v) => setState(() => _kind = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: SwipePages<_Kind>(
                value: _kind,
                values: _Kind.values,
                onChanged: (v) => setState(() => _kind = v),
                pageBuilder: (_, kind) => switch (kind) {
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
