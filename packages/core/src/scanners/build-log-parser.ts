import type { BuildIssueExplanation } from "../types/index.js";

interface LogPattern {
  id: string;
  patterns: RegExp[];
  explanation: BuildIssueExplanation;
}

const LOG_PATTERNS: LogPattern[] = [
  {
    id: "google-services-mismatch",
    patterns: [
      /google-services\.json.*package.*mismatch/i,
      /No matching client found for package name/i,
      /Application Id.*does not match/i,
    ],
    explanation: {
      rootCause:
        "The package name in google-services.json does not match the android.package in your app config.",
      suggestedFix:
        "Download a new google-services.json from Firebase Console that matches your android.package, or update android.package to match the Firebase project.",
      affectedFiles: ["google-services.json", "app.json", "app.config.ts"],
      nextActions: [
        "Verify android.package in app config",
        "Re-download google-services.json from Firebase",
        "Place file in project root or android/app/",
        "Rebuild with eas build --platform android",
      ],
    },
  },
  {
    id: "missing-android-package",
    patterns: [
      /android\.package.*not.*defined/i,
      /Missing package name/i,
      /applicationId.*not.*set/i,
    ],
    explanation: {
      rootCause: "Android package name is not configured in app config.",
      suggestedFix: 'Add "android": { "package": "com.yourcompany.app" } to app.json or app.config.ts.',
      affectedFiles: ["app.json", "app.config.ts", "app.config.js"],
      nextActions: [
        "Add android.package to app config",
        "Ensure it matches your Firebase/EAS project",
        "Run eas build:configure if needed",
      ],
    },
  },
  {
    id: "ios-provisioning",
    patterns: [
      /provisioning profile/i,
      /No profiles for.*were found/i,
      /Signing certificate/i,
      /Code signing error/i,
    ],
    explanation: {
      rootCause: "iOS code signing failed due to provisioning profile or certificate issues.",
      suggestedFix:
        "Verify your Apple Developer credentials in EAS. Run eas credentials to manage certificates and provisioning profiles.",
      affectedFiles: ["eas.json", "app.json"],
      nextActions: [
        "Run: eas credentials --platform ios",
        "Verify bundle identifier matches Apple Developer portal",
        "Ensure Apple Developer account has valid certificates",
        "Retry build with --clear-cache if credentials were updated",
      ],
    },
  },
  {
    id: "cocoapods-failure",
    patterns: [
      /pod install.*failed/i,
      /CocoaPods could not find compatible versions/i,
      /Unable to find a specification for/i,
      /Error installing pods/i,
    ],
    explanation: {
      rootCause: "CocoaPods dependency resolution failed during iOS native build.",
      suggestedFix:
        "Check for incompatible native module versions. Run npx expo install --fix and ensure all packages support your Expo SDK version.",
      affectedFiles: ["package.json", "ios/Podfile"],
      nextActions: [
        "Run: npx expo install --fix",
        "Check native module compatibility with your SDK",
        "Remove node_modules and reinstall",
        "Retry build with --clear-cache",
      ],
    },
  },
  {
    id: "gradle-failure",
    patterns: [
      /Gradle build failed/i,
      /Execution failed for task/i,
      /BUILD FAILED/i,
      /Could not resolve all dependencies/i,
    ],
    explanation: {
      rootCause: "Android Gradle build failed, often due to dependency conflicts or misconfiguration.",
      suggestedFix:
        "Review Gradle error output for the specific failing task. Common fixes include updating dependencies and clearing build cache.",
      affectedFiles: ["package.json", "android/build.gradle", "android/app/build.gradle"],
      nextActions: [
        "Identify the failing Gradle task in the log",
        "Run: npx expo install --fix",
        "Retry with eas build --clear-cache",
        "Check for Android SDK version conflicts",
      ],
    },
  },
  {
    id: "missing-env-var",
    patterns: [
      /environment variable.*not.*set/i,
      /process\.env\.\w+.*undefined/i,
      /Missing required env/i,
      /ENV.*is required/i,
    ],
    explanation: {
      rootCause: "A required environment variable is missing during the build process.",
      suggestedFix:
        "Add the missing variable to eas.json build profile env section or EAS Secrets.",
      affectedFiles: ["eas.json", ".env", ".env.production"],
      nextActions: [
        "Identify the missing variable from the log",
        "Add to eas.json profile env or EAS Secrets",
        "Run: eas secret:create for sensitive values",
        "Retry the build",
      ],
    },
  },
  {
    id: "app-config-error",
    patterns: [
      /app\.config.*error/i,
      /Error reading Expo config/i,
      /Failed to resolve plugin/i,
      /Config plugin.*failed/i,
    ],
    explanation: {
      rootCause: "App configuration failed to load or a config plugin threw an error.",
      suggestedFix:
        "Validate app.config.ts/js syntax and ensure all config plugins are installed and compatible.",
      affectedFiles: ["app.config.ts", "app.config.js", "app.json"],
      nextActions: [
        "Run: npx expo config --type public",
        "Fix syntax errors in app config",
        "Verify config plugin packages are installed",
        "Check plugin compatibility with SDK version",
      ],
    },
  },
  {
    id: "dependency-conflict",
    patterns: [
      /ERESOLVE/i,
      /peer dep.*unmet/i,
      /version conflict/i,
      /incompatible version/i,
      /requires a peer of/i,
    ],
    explanation: {
      rootCause: "Dependency version conflict detected between packages.",
      suggestedFix:
        "Run npx expo install --fix to align dependencies with your Expo SDK version.",
      affectedFiles: ["package.json", "package-lock.json", "pnpm-lock.yaml"],
      nextActions: [
        "Run: npx expo install --fix",
        "Remove lock file and node_modules, reinstall",
        "Check for packages not compatible with your SDK",
        "Use expo-doctor for additional diagnostics",
      ],
    },
  },
];

export function parseBuildLog(log: string): BuildIssueExplanation | null {
  for (const pattern of LOG_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(log)) {
        return pattern.explanation;
      }
    }
  }
  return null;
}

