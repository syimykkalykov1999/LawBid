import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/features/auth/application/sign_out.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';

/// `/onboarding/language` — Шаг 1 «Язык» (docs/01_FOUNDATION_AUTH.md §11):
/// active languages from `/i18n/languages` (merged with the compiled-in
/// catalog), pre-selected to the current UI language (itself defaulted
/// from the device on first run). Choosing switches the UI instantly;
/// Continue persists `uiLanguage` server-side and moves to consents.
class LanguageStepScreen extends ConsumerStatefulWidget {
  const LanguageStepScreen({super.key});

  @override
  ConsumerState<LanguageStepScreen> createState() => _LanguageStepScreenState();
}

class _LanguageStepScreenState extends ConsumerState<LanguageStepScreen> {
  String? _selected;

  String _initialCode() {
    final current = ref.read(languageControllerProvider).value;
    if (current != null) return current.name;
    final device =
        WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    return AppLanguage.values.any((l) => l.name == device)
        ? device
        : AppLanguage.en.name;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final catalog = ref.watch(languageCatalogProvider);
    final action = ref.watch(onboardingActionsProvider);
    final selected = _selected ?? _initialCode();

    LanguageCatalogEntry? selectedEntry;
    for (final e in catalog.value ?? const <LanguageCatalogEntry>[]) {
      if (e.code == selected) selectedEntry = e;
    }

    Future<void> choose(LanguageCatalogEntry entry) async {
      setState(() => _selected = entry.code);
      final lang = entry.appLanguage;
      if (lang != null) {
        await ref.read(languageControllerProvider.notifier).setLanguage(lang);
      }
    }

    final List<Widget> body = catalog.when(
      loading: () => [
        for (var i = 0; i < 4; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          const AppSkeleton(height: 56, borderRadius: AppRadii.card),
        ],
      ],
      error: (_, __) => const [],
      data: (entries) => entries.isEmpty
          ? [
              SizedBox(
                height: 280,
                child: AppEmptyState(
                  icon: Icons.translate_rounded,
                  message: t.t('lang.picker.empty'),
                ),
              ),
            ]
          : [
              for (var i = 0; i < entries.length; i++) ...[
                if (i > 0) const SizedBox(height: AppSpacing.xs),
                AppListRow(
                  label: entries[i].nativeName,
                  trailingText: entries[i].appLanguage == null
                      ? t.t('lang.picker.comingSoon')
                      : (entries[i].nativeName == entries[i].englishName
                          ? null
                          : entries[i].englishName),
                  selected: entries[i].code == selected,
                  showChevron: false,
                  onTap: entries[i].appLanguage == null
                      ? null
                      : () => unawaited(choose(entries[i])),
                ),
              ],
            ],
    );

    return OnboardingScaffold(
      step: OnboardingStepId.language,
      title: t.t('onboarding.language.title'),
      subtitle: t.t('onboarding.language.subtitle'),
      onBack: () => unawaited(signOut(ref)),
      error: action.error,
      primaryLabel: t.t('onboarding.continue'),
      primaryLoading: action.busy,
      onPrimary: () => ref
          .read(onboardingActionsProvider.notifier)
          .saveLanguage(selected, appLanguage: selectedEntry?.appLanguage),
      children: body,
    );
  }
}
