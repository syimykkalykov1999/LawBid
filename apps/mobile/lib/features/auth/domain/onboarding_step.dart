/// Steps of the welcome → phone → otp → role flow (file 07 §6, file 01
/// §10/11). `completed` isn't a screen — it's the value
/// `OnboardingLocalStore` clears on, and the guard's signal that resume
/// logic no longer applies (see auth_guard.dart).
enum OnboardingStep { welcome, phone, otp, role, completed }
