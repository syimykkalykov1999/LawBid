import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Only the prod flavor (com.lawbid.lawbid) is registered in Firebase; its
// config sits in app/src/prod/google-services.json (git-ignored). dev and
// staging build without one and simply have push switched off.
extensions.configure<com.google.gms.googleservices.GoogleServicesPlugin.GoogleServicesPluginConfig>("googleServices") {
    missingGoogleServicesStrategy =
        com.google.gms.googleservices.GoogleServicesPlugin.MissingGoogleServicesStrategy.WARN
}

/** Minutes since 2026-01-01T00:00:00Z — always increasing; fits versionCode until year 6000. */
fun autoBuildNumber(): Int = ((System.currentTimeMillis() / 1000 - 1767225600L) / 60).toInt()

android {
    namespace = "com.lawbid.lawbid"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications (planner reminders) needs java.time
        // on every supported Android.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // Base id (owner decision, p12 leaf-1.4): the prod flavor ships under
        // exactly this id to Google Play; dev/staging add a suffix below so
        // all three variants install side by side on one device.
        applicationId = "com.lawbid.lawbid"
        // docs/01_FOUNDATION_AUTH.md §5.1: "Android 8+ (API 26+)". Also
        // covers local_auth's BiometricPrompt path (API 23+) and the SMS
        // Retriever API used for OTP autofill.
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        // Build number: pubspec.yaml keeps `+1`, which means "automatic". A
        // build without an explicit `--build-number` gets the minutes since
        // 2026-01-01 UTC, so every upload is higher than the last one, on
        // any machine or CI, with nobody bumping anything. iOS uses the same
        // formula (Runner build phase "Auto build number").
        versionCode = flutter.versionCode.takeIf { it != 1 } ?: autoBuildNumber()
        versionName = flutter.versionName

        // App Links host (docs/01_FOUNDATION_AUTH.md §12: `lawbid.dev`).
        // Override without editing this file, e.g.
        //   flutter build apk --flavor prod -t lib/main_prod.dart -Plawbid.deepLinkHost=example.com
        // It must match the host serving docs/deeplinks/assetlinks.json.
        manifestPlaceholders["deepLinkHost"] =
            (project.findProperty("lawbid.deepLinkHost") as String?) ?: "lawbid.dev"
    }

    // Three installable variants side by side (p12 leaf-1.4), Flutter's
    // flavor convention: `flutter run --flavor dev -t lib/main_dev.dart`.
    // `app_name` feeds android:label in AndroidManifest.xml. The version
    // name is NOT suffixed: it is sent as X-App-Version and compared with
    // min_app_version_* on the server.
    buildFeatures {
        // AGP 9 disables resValue by default; the flavors need it for app_name.
        resValues = true
    }
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "LawBid")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "LawBid Staging")
        }
        create("prod") {
            dimension = "env"
            // No suffix: this is the id published to Google Play.
            resValue("string", "app_name", "LawBid")
        }
    }

    signingConfigs {
        create("upload") {
            // Keystore from the environment (CI) or, for a build on the
            // owner's Mac, from the git-ignored android/key.properties
            // (storeFile, storePassword, keyAlias, keyPassword).
            val props = Properties().apply {
                val f = rootProject.file("key.properties")
                if (f.exists()) f.inputStream().use { load(it) }
            }
            fun cfg(env: String, key: String): String? =
                System.getenv(env) ?: props.getProperty(key)
            storeFile = cfg("ANDROID_KEYSTORE_PATH", "storeFile")?.let { file(it) }
            storePassword = cfg("ANDROID_KEYSTORE_PASSWORD", "storePassword")
            keyAlias = cfg("ANDROID_KEY_ALIAS", "keyAlias")
            keyPassword = cfg("ANDROID_KEY_PASSWORD", "keyPassword")
        }
    }

    val hasUploadKey = System.getenv("ANDROID_KEYSTORE_PATH") != null ||
        rootProject.file("key.properties").exists()

    // A store bundle signed with the debug key is rejected by Google Play
    // after a long build; fail early with a clear message instead. Local
    // `flutter run --release` / `build apk --release` still use the debug key.
    gradle.taskGraph.whenReady {
        val bundlesProd = allTasks.any {
            it.name.startsWith("bundle") && it.name.endsWith("Release") && it.name.contains("Prod")
        }
        if (bundlesProd && !hasUploadKey) {
            throw GradleException(
                "Release bundle needs the upload key: create android/key.properties " +
                    "or set ANDROID_KEYSTORE_PATH (see docs/runbooks/STORE_RELEASE.md)."
            )
        }
    }

    buildTypes {
        release {
            // Upload key when present, otherwise the debug key so local
            // `flutter run --release` keeps working (store bundles are
            // blocked above).
            signingConfig = if (hasUploadKey)
                signingConfigs.getByName("upload") else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}

flutter {
    source = "../.."
}
