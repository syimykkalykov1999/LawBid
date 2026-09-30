import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

String _link(WidgetRef ref, String postId) => SocialFormat.postLink(
      ref.read(appEnvironmentProvider).deepLinkHost,
      postId,
    );

/// §4 "Поделиться": the system share sheet with `lawbid.app/post/:id`.
Future<void> sharePost(BuildContext context, WidgetRef ref, Post post) async {
  final box = context.findRenderObject() as RenderBox?;
  final result = await SharePlus.instance.share(ShareParams(
    uri: Uri.parse(_link(ref, post.id)),
    sharePositionOrigin:
        box == null ? null : box.localToGlobal(Offset.zero) & box.size,
  ));
  // OQ-037: count it unless the sheet was just closed.
  if (result.status != ShareResultStatus.dismissed) {
    await ref.read(socialActionsProvider).recordShare(post);
  }
}

/// §2.4 "⋯": someone else's post — report, copy link; your own — edit
/// text, delete, copy link.
Future<void> showPostMenu(BuildContext context, WidgetRef ref, Post post) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (post.isMine) ...[
              AppListRow(
                icon: Icons.edit_outlined,
                label: t.t('post.menu.edit'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showEditPostSheet(context, ref, post);
                },
              ),
              AppListRow(
                icon: Icons.delete_outline_rounded,
                label: t.t('post.menu.delete'),
                destructive: true,
                showChevron: false,
                onTap: () async {
                  Navigator.of(sheet).pop();
                  final ok = await showConfirmSheet(
                    context,
                    t: t,
                    title: t.t('post.delete.title'),
                    message: t.t('post.delete.message'),
                    confirmLabel: t.t('post.menu.delete'),
                    destructive: true,
                  );
                  if (!ok || !context.mounted) return;
                  final error =
                      await ref.read(socialActionsProvider).deletePost(post);
                  if (context.mounted) {
                    showAppSnackBar(
                        context,
                        error == null
                            ? t.t('post.deleted')
                            : errorText(t, error));
                  }
                },
              ),
            ] else
              AppListRow(
                icon: Icons.flag_outlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showReportSheet(context, ref, ReportTarget.post, post.id);
                },
              ),
            AppListRow(
              icon: Icons.link_rounded,
              label: t.t('post.menu.copyLink'),
              showChevron: false,
              onTap: () async {
                Navigator.of(sheet).pop();
                await Clipboard.setData(
                    ClipboardData(text: _link(ref, post.id)));
                if (context.mounted) {
                  showAppSnackBar(context, t.t('post.linkCopied'));
                }
              },
            ),
          ],
        ),
      ),
    ),
  );
}

/// `POST /reports` with a `report_reason` (§4, §12). A repeat by the same
/// user is ignored by the server, so the answer is always "thanks".
Future<void> showReportSheet(
  BuildContext context,
  WidgetRef ref,
  ReportTarget target,
  String id,
) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) {
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                    AppSpacing.sm, AppSpacing.screenSide, AppSpacing.md),
                child: Text(t.t('report.title'), style: type.titleMedium),
              ),
              for (final reason in ReportReason.values)
                AppListRow(
                  label: t.t('report.reason.${reason.name}'),
                  showChevron: false,
                  onTap: () async {
                    Navigator.of(sheet).pop();
                    final error = await ref
                        .read(socialActionsProvider)
                        .report(target, id, reason);
                    if (context.mounted) {
                      showAppSnackBar(
                          context,
                          error == null
                              ? t.t('report.sent')
                              : errorText(t, error));
                    }
                  },
                ),
            ],
          ),
        ),
      );
    },
  );
}

/// "Редактировать текст" (§3.3): text only, photos stay.
Future<void> showEditPostSheet(BuildContext context, WidgetRef ref, Post post) {
  return showAppBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _EditPostSheet(post: post),
  );
}

class _EditPostSheet extends ConsumerStatefulWidget {
  const _EditPostSheet({required this.post});

  final Post post;

  @override
  ConsumerState<_EditPostSheet> createState() => _EditPostSheetState();
}

class _EditPostSheetState extends ConsumerState<_EditPostSheet> {
  late final _text = TextEditingController(text: widget.post.body);
  bool _saving = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final body = _text.text.trim();
    if (body.isEmpty || _saving) return;
    setState(() => _saving = true);
    final error =
        await ref.read(socialActionsProvider).editPost(widget.post, body);
    if (!mounted) return;
    setState(() => _saving = false);
    if (error != null) {
      showAppSnackBar(context, errorText(t, error));
      return;
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.screenSide,
        right: AppSpacing.screenSide,
        bottom: MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          Text(t.t('post.menu.edit'), style: type.titleMedium),
          const SizedBox(height: AppSpacing.md),
          PostTextField(controller: _text, autofocus: true),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: t.t('common.save'),
            isLoading: _saving,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}

/// Multi-line post text with a live "n / 2200" counter.
class PostTextField extends ConsumerWidget {
  const PostTextField({
    required this.controller,
    this.autofocus = false,
    this.hint,
    super.key,
  });

  final TextEditingController controller;
  final bool autofocus;
  final String? hint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        TextField(
          controller: controller,
          autofocus: autofocus,
          minLines: 4,
          maxLines: 10,
          maxLength: kPostMaxChars,
          maxLengthEnforcement: MaxLengthEnforcement.enforced,
          buildCounter: (_,
                  {required currentLength, required isFocused, maxLength}) =>
              null,
          style: type.body.copyWith(color: colors.text),
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: colors.bg,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.gold, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, v, _) {
            final n = v.text.characters.length;
            final near = n > kPostMaxChars * 0.9;
            return Text(
              '$n / $kPostMaxChars',
              style: type.caption.copyWith(
                color: near ? colors.warning : colors.textSecondary,
              ),
            );
          },
        ),
      ],
    );
  }
}
