import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// Audit 2026-10-19: the client's «Подробности» (names, case number,
/// addresses…) were shown nowhere as text and could not be changed after a
/// bid was accepted. The owner reads and edits them here; the hired
/// attorney reads them. [onSaved] refreshes the case after an edit; null =
/// read-only.
class PrivateDetailsCard extends ConsumerWidget {
  const PrivateDetailsCard({
    required this.caseId,
    required this.text,
    required this.isOwner,
    this.onSaved,
    this.hired = false,
    this.padding = const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
    super.key,
  });

  final EdgeInsetsGeometry padding;

  final String caseId;
  final String? text;
  final bool isOwner;

  /// An attorney is hired: the owner is told the attorney sees the change.
  final bool hired;
  final VoidCallback? onSaved;

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final next = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _DetailsSheet(initial: text ?? '', hired: hired),
    );
    if (next == null || !context.mounted) return;
    final t = ref.read(translatorProvider);
    try {
      await ref.read(casesRepositoryProvider).setPrivateDetails(caseId, next);
      onSaved?.call();
      if (context.mounted) showAppSnackBar(context, t.t('cases.details.saved'));
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final body = text?.trim() ?? '';
    // The attorney sees nothing when the client wrote none.
    if (!isOwner && body.isEmpty) return const SizedBox.shrink();
    final canEdit = isOwner && onSaved != null;
    return Padding(
      padding: padding,
      child: DetailSection(
        key: const ValueKey('case-private-details'),
        title: t.t('cases.details.title'),
        trailing: canEdit
            ? TextButton(
                key: const ValueKey('case-private-details-edit'),
                onPressed: () => _edit(context, ref),
                child: Text(
                  t.t(
                    body.isEmpty ? 'cases.details.add' : 'cases.details.edit',
                  ),
                ),
              )
            : null,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (body.isNotEmpty)
              SelectableText(
                body,
                style: type.body.copyWith(color: colors.text),
              )
            else
              Text(
                t.t('cases.details.empty'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(
                  AppIcons.lockOutlineRounded,
                  size: 14,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    t.t(
                      isOwner
                          ? 'cases.details.ownerHint'
                          : 'cases.details.attorneyHint',
                    ),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailsSheet extends ConsumerStatefulWidget {
  const _DetailsSheet({required this.initial, required this.hired});

  final String initial;
  final bool hired;

  @override
  ConsumerState<_DetailsSheet> createState() => _DetailsSheetState();
}

class _DetailsSheetState extends ConsumerState<_DetailsSheet> {
  late final _text = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('cases.details.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _text,
                label: t.t('cases.details.title'),
                hintText: t.t('cases.field.privateDetailsHint'),
                autofocus: true,
                tapAnywhere: true,
                maxLines: 8,
                maxLength: CaseLimits.privateDetailsMax,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t(
                  widget.hired
                      ? 'cases.details.hiredNote'
                      : 'cases.details.ownerHint',
                ),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                key: const ValueKey('case-private-details-save'),
                label: t.t('cases.details.save'),
                isEnabled: _text.text.trim() != widget.initial.trim(),
                onPressed: () => Navigator.of(context).pop(_text.text.trim()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
