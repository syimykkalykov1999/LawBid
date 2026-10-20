import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/privacy/application/privacy_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

/// Max characters of an appeal (the server's limit).
const _appealMax = 1000;

/// Owner 2026-10-20: Settings → Privacy → «Decisions on my content»: what
/// moderation hid, removed or warned about, why, and — for hidden or
/// removed posts, comments and messages — one appeal with its result.
class ModerationNoticesScreen extends ConsumerWidget {
  const ModerationNoticesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final list = ref.watch(moderationNoticesProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('privacy.notices')),
      ),
      body: AsyncDetailBody<List<ModerationNotice>>(
        value: list,
        t: t,
        onRetry: () => ref.invalidate(moderationNoticesProvider),
        builder: (notices) => notices.isEmpty
            ? AppEmptyState(
                icon: AppIcons.policyOutlined,
                message: t.t('notices.empty'),
              )
            : ListView.separated(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.md,
                  AppSpacing.screenSide,
                  AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: notices.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppSpacing.sm),
                itemBuilder: (context, i) => _NoticeCard(notice: notices[i]),
              ),
      ),
    );
  }
}

class _NoticeCard extends ConsumerWidget {
  const _NoticeCard({required this.notice});

  final ModerationNotice notice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reason = notice.reason?.trim();
    final excerpt = notice.excerpt?.trim();
    final appeal = notice.appealStatus;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('notices.action.${notice.action}'),
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                f.date(notice.createdAt.toLocal()),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
          if (excerpt != null && excerpt.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              excerpt,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          ],
          if (reason != null && reason.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('notices.reason', {'reason': reason}),
              style: type.body.copyWith(color: colors.text),
            ),
          ],
          if (appeal != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('notices.appeal.$appeal'),
              style: type.body.copyWith(
                color: appeal == 'rejected' ? colors.dangerText : colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (notice.appealNote != null &&
                notice.appealNote!.trim().isNotEmpty)
              Text(
                notice.appealNote!.trim(),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
          ],
          if (notice.canAppeal) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: ValueKey('appeal-${notice.actionId}'),
              label: t.t('notices.appeal'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => _appeal(context, ref, t),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _appeal(
    BuildContext context,
    WidgetRef ref,
    Translator t,
  ) async {
    final message = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AppealSheet(t: t),
    );
    if (message == null || !context.mounted) return;
    try {
      await ref
          .read(privacyRepositoryProvider)
          .appeal(notice.actionId, message);
      ref.invalidate(moderationNoticesProvider);
      if (context.mounted) showAppSnackBar(context, t.t('notices.appeal.sent'));
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
      // The decision may have changed meanwhile: show the current state.
      ref.invalidate(moderationNoticesProvider);
    }
  }
}

class _AppealSheet extends StatefulWidget {
  const _AppealSheet({required this.t});

  final Translator t;

  @override
  State<_AppealSheet> createState() => _AppealSheetState();
}

class _AppealSheetState extends State<_AppealSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final text = _controller.text.trim();
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                t.t('notices.appeal.title'),
                textAlign: TextAlign.center,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('notices.appeal.hint'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('appeal-field'),
              controller: _controller,
              label: t.t('notices.appeal.field'),
              maxLines: 5,
              maxLength: _appealMax,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('appeal-send'),
              label: t.t('notices.appeal.send'),
              height: AppSizes.touchTarget,
              onPressed:
                  text.isEmpty ? null : () => Navigator.of(context).pop(text),
            ),
          ],
        ),
      ),
    );
  }
}
