import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-05 (legal): the partner rules in a scrollable sheet. With
/// [withAccept] the sheet also offers «Accept» and resolves `true` when it
/// is tapped; «Close» (or a swipe) resolves null.
Future<bool?> showPartnerTermsSheet(
  BuildContext context, {
  required Translator t,
  required String terms,
  bool withAccept = false,
}) {
  return showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      final colors = Theme.of(sheet).extension<AppColorTokens>()!;
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      final maxHeight = MediaQuery.sizeOf(sheet).height * 0.85;
      return SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: maxHeight),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: Text(
                  t.t('partner.terms.title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  child: SelectableText(
                    terms,
                    key: const ValueKey('partner-terms-text'),
                    style: type.bodySmall.copyWith(
                      color: colors.text,
                      height: 1.45,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                child: withAccept
                    ? Row(
                        children: [
                          Expanded(
                            child: AppButton(
                              label: t.t('common.close'),
                              variant: AppButtonVariant.secondary,
                              onPressed: () => Navigator.of(sheet).pop(),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: AppButton(
                              key: const ValueKey('partner-terms-accept'),
                              label: t.t('partner.terms.accept'),
                              onPressed: () => Navigator.of(sheet).pop(true),
                            ),
                          ),
                        ],
                      )
                    : AppButton(
                        label: t.t('common.close'),
                        variant: AppButtonVariant.secondary,
                        onPressed: () => Navigator.of(sheet).pop(),
                      ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
