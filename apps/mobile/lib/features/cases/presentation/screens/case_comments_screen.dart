import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart'
    show caseThreadId;
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show commentThreadSlivers;
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';

/// Owner 2026-09-30 (OQ-034): comments under a case, built exactly like a
/// post's comments — replies, likes, delete, report, the composer. The
/// case owner and the attorneys who can see the case take part; the
/// client stays anonymous and contacts are refused by the server.
class CaseCommentsScreen extends ConsumerStatefulWidget {
  const CaseCommentsScreen({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<CaseCommentsScreen> createState() => _CaseCommentsScreenState();
}

class _CaseCommentsScreenState extends ConsumerState<CaseCommentsScreen> {
  ReplyTarget? _replyTo;
  final _focus = FocusNode();

  String get _thread => caseThreadId(widget.caseId);

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  void _reply(ReplyTarget target) {
    setState(() => _replyTo = target);
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final comments = ref.watch(commentsProvider(_thread));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('cases.comments.title')),
      ),
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              color: colors.gold,
              onRefresh: () async => ref.invalidate(commentsProvider(_thread)),
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenSide,
                        AppSpacing.md,
                        AppSpacing.screenSide,
                        0,
                      ),
                      child: Row(
                        children: [
                          AppIcon(
                            AppIcons.lockOutlineRounded,
                            size: AppSizes.iconSm,
                            color: colors.textSecondary,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              t.t('cases.comments.hint'),
                              style: type.caption
                                  .copyWith(color: colors.textSecondary),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  ...commentThreadSlivers(
                    context,
                    ref,
                    _thread,
                    comments,
                    _reply,
                  ),
                ],
              ),
            ),
          ),
          CommentComposer(
            postId: _thread,
            replyTo: _replyTo,
            focusNode: _focus,
            onClearReply: () => setState(() => _replyTo = null),
          ),
        ],
      ),
    );
  }
}
