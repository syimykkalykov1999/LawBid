import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// «Not enough stars» (a premium reaction, 402). Store rules (owner
/// 2026-10-20): the apps only say where the balance is topped up; the web
/// build opens the packs.
Future<void> showLowStarsSheet(
  BuildContext context,
  Translator t, {
  required int price,
}) {
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) {
      final colors = Theme.of(sheet).extension<AppColorTokens>()!;
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            0,
            AppSpacing.md,
            AppSpacing.md,
          ),
          child: Column(
            key: const ValueKey('low-stars-sheet'),
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.md),
              Text(
                '${t.t('error.api.INSUFFICIENT_STARS')} · $price ⭐',
                textAlign: TextAlign.center,
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.sm),
              if (kIsWeb)
                AppButton(
                  key: const ValueKey('low-stars-topup'),
                  label: t.t('stars.topup'),
                  onPressed: () {
                    Navigator.of(sheet).pop();
                    context.push(AppRoutes.stars);
                  },
                )
              else
                Text(
                  t.t('stars.topup.web'),
                  key: const ValueKey('low-stars-note'),
                  textAlign: TextAlign.center,
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
            ],
          ),
        ),
      );
    },
  );
}
