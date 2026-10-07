allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// file_picker 11 skips the Kotlin plugin on AGP 9+ (it assumes built-in
// Kotlin), but this app keeps android.builtInKotlin=false because other
// plugins still apply KGP. Without this its Kotlin sources never compile and
// GeneratedPluginRegistrant fails with "cannot find symbol FilePickerPlugin".
// Remove once every plugin supports built-in Kotlin.
//
// stripe_android (flutter_stripe 14, stage 6.8) applies KGP itself but sets
// no jvmTarget, so Kotlin follows the host JDK while its Java stays on 17
// ("Inconsistent JVM-target compatibility"); pin it the same way.
subprojects {
    if (project.name == "file_picker" || project.name == "stripe_android") {
        project.plugins.withId("com.android.library") {
            if (project.name == "file_picker") {
                project.pluginManager.apply("org.jetbrains.kotlin.android")
            }
            // Match the plugin's Java target (17), not the host JDK's.
            project.extensions.configure<org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension> {
                compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            }
        }
    }
}

// android_play_install_referrer 0.4.0 (the final release of that plugin)
// compiles against android-33, but the androidx libraries it pulls in
// (fragment 1.7, activity 1.8, window 1.2 ...) need 34+, so
// `checkReleaseAarMetadata` fails the release build. Compile every plugin
// library against at least android-36 (this only raises the compile-time
// API level; targetSdk / minSdk of the app are untouched).
subprojects {
    plugins.withId("com.android.library") {
        // `finalizeDsl` runs after the plugin's own `android {}` block and
        // before AGP locks the value (afterEvaluate is too late on AGP 9).
        extensions.configure<com.android.build.api.variant.LibraryAndroidComponentsExtension>("androidComponents") {
            finalizeDsl { library ->
                if ((library.compileSdk ?: 0) < 36) {
                    library.compileSdk = 36
                }
            }
        }
    }
}

// stripe_android's release lint classpath needs
// com.google.android.gms:play-services-tapandpay (Google's closed Push
// Provisioning artifact, not on any public repository; the app does not use
// Google Pay push provisioning). `lintVitalAnalyzeRelease` only runs lint
// checks on the way to the AAB and cannot resolve it, so it fails the build:
// skip those vital-lint tasks (they never change the produced bundle).
subprojects {
    tasks.matching { it.name.startsWith("lintVital") }.configureEach {
        enabled = false
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
