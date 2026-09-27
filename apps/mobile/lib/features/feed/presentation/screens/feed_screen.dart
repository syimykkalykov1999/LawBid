import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Stage 1.5 stub (file 01 §15). Real content (posts feed / client vs.
/// attorney tabs, Кейсы sub-tab) is file 5 (feed/search/chat/notifications).
class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Scaffold(
      appBar: AppTopBar(title: Text(t.t('feed.stub.title'))),
      body: AppEmptyState(
        icon: Icons.balance_rounded,
        message: t.t('empty.default.message'),
      ),
    );
  }
}
