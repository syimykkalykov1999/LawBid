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

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
