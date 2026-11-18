import 'package:lawbid/core/design_system/design_system.dart';
import 'package:material_ui/material_ui.dart';

/// A section title of the contacts lists ("On LawBid", "Invite to LawBid")
/// and of the «Новая группа» people picker; shared here so groups does not
/// import the contacts feature (feature_boundaries_test.dart).
class ContactsSectionTitle extends StatelessWidget {
  const ContactsSectionTitle(this.label, {this.count, super.key});

  final String label;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      child: Text(
        count == null ? label : '$label · $count',
        style: type.caption.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
