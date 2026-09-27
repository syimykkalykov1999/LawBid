/// Pre-session sign-in steps (welcome → phone|email → otp) plus the two
/// outcomes the welcome/OTP screens branch on after a successful sign-in:
/// [role] (new user) and [completed] (returning user). Post-sign-in
/// onboarding steps are server-driven — see `OnboardingStepId`
/// (features/onboarding) and AppRouterGuard.
enum OnboardingStep { welcome, phone, email, otp, role, completed }
