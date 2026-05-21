import type { FileSystemAdapter, Issue } from "../types/index.js";
import {
  createIssue,
  createPassedCheck,
  parseJsonSafe,
  getPackageVersion,
  joinPath,
  detectStagingUrl,
  DEPRECATED_PACKAGES,
  RISKY_PACKAGES,
  EAS_BUILD_PROFILES,
} from "../utils/helpers.js";
import { getExpoSdkStatus, getExpoSdkUpgradeCommand } from "../expo-sdk.js";

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AppJson {
  expo?: ExpoConfig;
}

interface ExpoConfig {
  name?: string;
  slug?: string;
  version?: string;
  runtimeVersion?: string | { policy: string };
  icon?: string;
  splash?: { image?: string };
  ios?: {
    bundleIdentifier?: string;
    infoPlist?: Record<string, string>;
  };
  android?: {
    package?: string;
    googleServicesFile?: string;
  };
  plugins?: unknown[];
}

interface EasJson {
  build?: Record<string, { extends?: string; channel?: string; env?: Record<string, string> }>;
  cli?: { appVersionSource?: string };
}

export interface ScanContext {
  projectPath: string;
  fs: FileSystemAdapter;
  packageJson?: PackageJson;
  appConfig?: ExpoConfig;
  easJson?: EasJson;
  appConfigPath?: string;
}

export type ScanRule = (ctx: ScanContext) => Promise<Issue[]>;

export const checkPackageJsonExists: ScanRule = async (ctx) => {
  const path = joinPath(ctx.projectPath, "package.json");
  const exists = await ctx.fs.exists(path);
  if (!exists) {
    return [
      createIssue({
        severity: "critical",
        category: "Project",
        title: "Missing package.json",
        description: "No package.json found in the project root.",
        filePath: path,
        suggestedFix: "Ensure you selected a valid Node.js project directory.",
      }),
    ];
  }
  return [
    createPassedCheck("Project", "package.json exists", "Project root contains package.json.", path),
  ];
};

export const detectExpoSdk: ScanRule = async (ctx) => {
  if (!ctx.packageJson) return [];
  const deps = { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies };
  const expoVersion = getPackageVersion(deps, "expo");
  if (!expoVersion) {
    return [
      createIssue({
        severity: "critical",
        category: "Expo SDK",
        title: "Expo package not installed",
        description: "The expo package was not found in dependencies.",
        filePath: joinPath(ctx.projectPath, "package.json"),
        suggestedFix: "Run: npx expo install expo",
        docsUrl: "https://docs.expo.dev/",
      }),
    ];
  }
  const major = expoVersion.split(".")[0];
  const sdkStatus = getExpoSdkStatus(expoVersion);
  const packageJsonPath = joinPath(ctx.projectPath, "package.json");

  if (!sdkStatus.isLatest) {
    return [
      createIssue({
        severity: "warning",
        category: "Expo SDK",
        title: `Expo SDK ${major} is outdated`,
        description: `This project uses SDK ${major}. The latest stable Expo SDK is ${sdkStatus.latestMajor}.`,
        filePath: packageJsonPath,
        suggestedFix: `Upgrade with: ${getExpoSdkUpgradeCommand(sdkStatus.latestMajor)} --fix`,
        docsUrl: "https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/",
      }),
    ];
  }

  return [
    createPassedCheck(
      "Expo SDK",
      `Expo SDK ${major} detected`,
      `expo@${expoVersion} is installed (latest stable SDK).`,
      packageJsonPath,
    ),
  ];
};

export const checkEasJson: ScanRule = async (ctx) => {
  const path = joinPath(ctx.projectPath, "eas.json");
  const exists = await ctx.fs.exists(path);
  if (!exists) {
    return [
      createIssue({
        severity: "warning",
        category: "EAS",
        title: "Missing eas.json",
        description: "EAS Build configuration file not found.",
        filePath: path,
        suggestedFix: "Run: eas build:configure",
        docsUrl: "https://docs.expo.dev/build/setup/",
      }),
    ];
  }
  return [
    createPassedCheck("EAS", "eas.json exists", "EAS configuration file found.", path),
  ];
};

export const checkAppConfig: ScanRule = async (ctx) => {
  const candidates = ["app.json", "app.config.js", "app.config.ts", "app.config.mjs"];
  for (const file of candidates) {
    const path = joinPath(ctx.projectPath, file);
    if (await ctx.fs.exists(path)) {
      return [
        createPassedCheck("Config", `${file} exists`, "App configuration file found.", path),
      ];
    }
  }
  return [
    createIssue({
      severity: "critical",
      category: "Config",
      title: "Missing app configuration",
      description: "No app.json, app.config.js, or app.config.ts found.",
      suggestedFix: "Create app.json or app.config.ts in the project root.",
      docsUrl: "https://docs.expo.dev/workflow/configuration/",
    }),
  ];
};

export const checkRuntimeVersion: ScanRule = async (ctx) => {
  if (!ctx.appConfig) return [];
  const rv = ctx.appConfig.runtimeVersion;
  if (!rv) {
    return [
      createIssue({
        severity: "warning",
        category: "Updates",
        title: "Missing runtimeVersion",
        description: "runtimeVersion is not configured. OTA updates require a runtime version.",
        filePath: ctx.appConfigPath,
        suggestedFix: 'Add runtimeVersion or use { policy: "appVersion" } in app config.',
        docsUrl: "https://docs.expo.dev/eas-update/runtime-versions/",
      }),
    ];
  }
  if (typeof rv === "string") {
    return [
      createIssue({
        severity: "warning",
        category: "Updates",
        title: "Hardcoded runtimeVersion",
        description: `runtimeVersion is hardcoded to "${rv}". This may break OTA updates when native code changes.`,
        filePath: ctx.appConfigPath,
        suggestedFix: 'Use { policy: "appVersion" } or { policy: "fingerprint" } instead.',
        docsUrl: "https://docs.expo.dev/eas-update/runtime-versions/",
      }),
    ];
  }
  return [
    createPassedCheck(
      "Updates",
      "runtimeVersion configured",
      `Using policy: ${rv.policy}`,
      ctx.appConfigPath,
    ),
  ];
};

export const checkIosBundleIdentifier: ScanRule = async (ctx) => {
  if (!ctx.appConfig?.ios?.bundleIdentifier) {
    return [
      createIssue({
        severity: "critical",
        category: "iOS",
        title: "Missing iOS bundle identifier",
        description: "ios.bundleIdentifier is not configured.",
        filePath: ctx.appConfigPath,
        suggestedFix: 'Add "ios": { "bundleIdentifier": "com.yourcompany.app" } to app config.',
      }),
    ];
  }
  return [
    createPassedCheck(
      "iOS",
      "Bundle identifier configured",
      ctx.appConfig.ios.bundleIdentifier,
      ctx.appConfigPath,
    ),
  ];
};

export const checkAndroidPackage: ScanRule = async (ctx) => {
  if (!ctx.appConfig?.android?.package) {
    return [
      createIssue({
        severity: "critical",
        category: "Android",
        title: "Missing Android package name",
        description: "android.package is not configured.",
        filePath: ctx.appConfigPath,
        suggestedFix: 'Add "android": { "package": "com.yourcompany.app" } to app config.',
      }),
    ];
  }
  return [
    createPassedCheck(
      "Android",
      "Package name configured",
      ctx.appConfig.android.package,
      ctx.appConfigPath,
    ),
  ];
};

export const checkAppIcon: ScanRule = async (ctx) => {
  if (!ctx.appConfig?.icon) {
    return [
      createIssue({
        severity: "warning",
        category: "Assets",
        title: "App icon not configured",
        description: "No icon field found in app config.",
        filePath: ctx.appConfigPath,
        suggestedFix: 'Add "icon": "./assets/icon.png" to your app config.',
      }),
    ];
  }
  const iconPath = joinPath(ctx.projectPath, ctx.appConfig.icon.replace(/^\.\//, ""));
  const exists = await ctx.fs.exists(iconPath);
  if (!exists) {
    return [
      createIssue({
        severity: "warning",
        category: "Assets",
        title: "App icon file missing",
        description: `Icon file not found at ${ctx.appConfig.icon}`,
        filePath: iconPath,
        suggestedFix: "Add the icon file or update the path in app config.",
      }),
    ];
  }
  return [
    createPassedCheck("Assets", "App icon configured", ctx.appConfig.icon, iconPath),
  ];
};

export const checkSplashScreen: ScanRule = async (ctx) => {
  if (!ctx.appConfig?.splash?.image) {
    return [
      createIssue({
        severity: "info",
        category: "Assets",
        title: "Splash screen not configured",
        description: "No splash.image found in app config.",
        filePath: ctx.appConfigPath,
        suggestedFix: 'Add "splash": { "image": "./assets/splash.png" } to app config.',
      }),
    ];
  }
  return [
    createPassedCheck("Assets", "Splash screen configured", "Splash image is set.", ctx.appConfigPath),
  ];
};

export const checkNotificationPermissions: ScanRule = async (ctx) => {
  if (!ctx.packageJson) return [];
  const deps = { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies };
  const hasNotifications =
    deps["expo-notifications"] || deps["@react-native-community/push-notification-ios"];
  if (!hasNotifications) return [];

  const infoPlist = ctx.appConfig?.ios?.infoPlist;
  const hasUsageDescription =
    infoPlist?.NSUserNotificationUsageDescription ||
    infoPlist?.UIBackgroundModes?.includes("remote-notification");

  if (!hasUsageDescription) {
    return [
      createIssue({
        severity: "warning",
        category: "iOS",
        title: "Missing notification permission text",
        description: "Notifications package is installed but iOS permission usage description is missing.",
        filePath: ctx.appConfigPath,
        suggestedFix:
          'Add NSUserNotificationUsageDescription to ios.infoPlist in app config.',
        docsUrl: "https://docs.expo.dev/versions/latest/sdk/notifications/",
      }),
    ];
  }
  return [
    createPassedCheck("iOS", "Notification permissions configured", "Usage description found.", ctx.appConfigPath),
  ];
};

export const checkExpoRouter: ScanRule = async (ctx) => {
  if (!ctx.packageJson) return [];
  const deps = { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies };
  const hasRouter = !!deps["expo-router"];
  if (!hasRouter) {
    return [
      createIssue({
        severity: "info",
        category: "Router",
        title: "expo-router not installed",
        description: "This project does not use Expo Router.",
        filePath: joinPath(ctx.projectPath, "package.json"),
      }),
    ];
  }
  const appDir = joinPath(ctx.projectPath, "app");
  const appExists = await ctx.fs.exists(appDir);
  if (!appExists) {
    return [
      createIssue({
        severity: "critical",
        category: "Router",
        title: "Missing app/ directory",
        description: "expo-router is installed but no app/ directory was found.",
        filePath: appDir,
        suggestedFix: "Create an app/ directory with _layout.tsx and index.tsx.",
        docsUrl: "https://docs.expo.dev/router/introduction/",
      }),
    ];
  }
  return [
    createPassedCheck("Router", "Expo Router enabled", "expo-router installed with app/ directory.", appDir),
  ];
};

export const checkEnvProduction: ScanRule = async (ctx) => {
  const path = joinPath(ctx.projectPath, ".env.production");
  const exists = await ctx.fs.exists(path);
  if (!exists) return [];

  const content = await ctx.fs.readFile(path);
  if (detectStagingUrl(content)) {
    return [
      createIssue({
        severity: "critical",
        category: "Environment",
        title: "Production env contains staging/dev URLs",
        description: ".env.production appears to contain localhost, staging, or dev API URLs.",
        filePath: path,
        suggestedFix: "Review .env.production and ensure production API URLs are used.",
      }),
    ];
  }
  return [
    createPassedCheck("Environment", ".env.production looks clean", "No obvious staging URLs detected.", path),
  ];
};

export const checkDeprecatedPackages: ScanRule = async (ctx) => {
  if (!ctx.packageJson) return [];
  const deps = { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies };
  const issues: Issue[] = [];

  for (const pkg of DEPRECATED_PACKAGES) {
    if (deps[pkg]) {
      issues.push(
        createIssue({
          severity: "warning",
          category: "Dependencies",
          title: `Deprecated package: ${pkg}`,
          description: `${pkg} is deprecated and may cause compatibility issues.`,
          filePath: joinPath(ctx.projectPath, "package.json"),
          suggestedFix: `Remove ${pkg} and migrate to the recommended replacement.`,
        }),
      );
    }
  }

  for (const pkg of RISKY_PACKAGES) {
    if (deps[pkg]) {
      issues.push(
        createIssue({
          severity: "info",
          category: "Dependencies",
          title: `Known risky package: ${pkg}`,
          description: `${pkg} has known maintenance or compatibility concerns.`,
          filePath: joinPath(ctx.projectPath, "package.json"),
          suggestedFix: `Consider alternatives to ${pkg}.`,
        }),
      );
    }
  }

  if (issues.length === 0) {
    issues.push(
      createPassedCheck("Dependencies", "No deprecated packages", "No known deprecated packages detected."),
    );
  }
  return issues;
};

interface GoogleServicesJson {
  client?: Array<{
    client_info?: {
      android_client_info?: {
        package_name?: string;
      };
    };
  }>;
}

function projectUsesFirebase(deps: Record<string, string>, appConfig: ExpoConfig | undefined): boolean {
  if (appConfig?.android?.googleServicesFile) return true;
  return Object.keys(deps).some(
    (name) =>
      name.startsWith("@react-native-firebase/") ||
      name === "firebase" ||
      name.startsWith("expo-firebase"),
  );
}

export const checkGoogleServicesJson: ScanRule = async (ctx) => {
  if (!ctx.packageJson) return [];

  const deps = { ...ctx.packageJson.dependencies, ...ctx.packageJson.devDependencies };
  if (!projectUsesFirebase(deps, ctx.appConfig)) return [];

  const androidPackage = ctx.appConfig?.android?.package;
  const configuredPath = ctx.appConfig?.android?.googleServicesFile;
  const candidatePaths = [
    configuredPath ? joinPath(ctx.projectPath, configuredPath.replace(/^\.\//, "")) : null,
    joinPath(ctx.projectPath, "google-services.json"),
    joinPath(ctx.projectPath, "android", "app", "google-services.json"),
  ].filter(Boolean) as string[];

  let resolvedPath: string | null = null;
  for (const path of candidatePaths) {
    if (await ctx.fs.exists(path)) {
      resolvedPath = path;
      break;
    }
  }

  if (!resolvedPath) {
    return [
      createIssue({
        id: "google-services-missing",
        severity: "critical",
        category: "Android",
        title: "Missing google-services.json",
        description:
          "Firebase or Google Services is used but no google-services.json file was found.",
        filePath: joinPath(ctx.projectPath, "google-services.json"),
        suggestedFix:
          "Download google-services.json from Firebase Console and place it in your project root or set android.googleServicesFile.",
        docsUrl: "https://docs.expo.dev/guides/using-firebase/",
      }),
    ];
  }

  if (!androidPackage) {
    return [];
  }

  try {
    const content = await ctx.fs.readFile(resolvedPath);
    const parsed = parseJsonSafe<GoogleServicesJson>(content);
    const packageNames =
      parsed?.client
        ?.map((entry) => entry.client_info?.android_client_info?.package_name)
        .filter((value): value is string => Boolean(value)) ?? [];

    if (packageNames.length === 0) {
      return [
        createIssue({
          id: "google-services-invalid",
          severity: "warning",
          category: "Android",
          title: "Could not read google-services.json",
          description: "The file exists but no Android package names were found inside it.",
          filePath: resolvedPath,
          suggestedFix: "Re-download google-services.json from Firebase Console for this app.",
        }),
      ];
    }

    if (!packageNames.includes(androidPackage)) {
      return [
        createIssue({
          id: "google-services-mismatch",
          severity: "critical",
          category: "Android",
          title: "google-services.json package mismatch",
          description: `android.package is "${androidPackage}" but google-services.json contains: ${packageNames.join(", ")}.`,
          filePath: resolvedPath,
          suggestedFix:
            "Download a new google-services.json that matches android.package, or update android.package in app config.",
          docsUrl: "https://docs.expo.dev/guides/using-firebase/",
        }),
      ];
    }

    return [
      createPassedCheck(
        "Android",
        "google-services.json matches Android package",
        `Package "${androidPackage}" found in google-services.json.`,
        resolvedPath,
      ),
    ];
  } catch {
    return [
      createIssue({
        id: "google-services-invalid",
        severity: "warning",
        category: "Android",
        title: "Invalid google-services.json",
        description: "The file exists but could not be parsed as JSON.",
        filePath: resolvedPath,
        suggestedFix: "Re-download google-services.json from Firebase Console.",
      }),
    ];
  }
};

export const checkEasBuildProfiles: ScanRule = async (ctx) => {
  if (!ctx.easJson?.build) {
    return [
      createIssue({
        severity: "warning",
        category: "EAS",
        title: "EAS build profiles not configured",
        description: "eas.json exists but has no build profiles.",
        filePath: joinPath(ctx.projectPath, "eas.json"),
        suggestedFix: "Run: eas build:configure",
      }),
    ];
  }

  const profiles = Object.keys(ctx.easJson.build);
  const issues: Issue[] = [];

  for (const required of EAS_BUILD_PROFILES) {
    const hasProfile = profiles.some(
      (p) => p === required || ctx.easJson!.build![p]?.extends === required,
    );
    if (!hasProfile) {
      issues.push(
        createIssue({
          severity: "warning",
          category: "EAS",
          title: `Missing EAS build profile: ${required}`,
          description: `No ${required} build profile found in eas.json.`,
          filePath: joinPath(ctx.projectPath, "eas.json"),
          suggestedFix: `Add a "${required}" profile to eas.json.`,
          docsUrl: "https://docs.expo.dev/build/eas-json/",
        }),
      );
    }
  }

  if (issues.length === 0) {
    issues.push(
      createPassedCheck(
        "EAS",
        "EAS build profiles configured",
        "development, preview, and production profiles found.",
        joinPath(ctx.projectPath, "eas.json"),
      ),
    );
  }
  return issues;
};

export const ALL_SCAN_RULES: ScanRule[] = [
  checkPackageJsonExists,
  detectExpoSdk,
  checkEasJson,
  checkAppConfig,
  checkRuntimeVersion,
  checkIosBundleIdentifier,
  checkAndroidPackage,
  checkAppIcon,
  checkSplashScreen,
  checkNotificationPermissions,
  checkExpoRouter,
  checkEnvProduction,
  checkDeprecatedPackages,
  checkGoogleServicesJson,
  checkEasBuildProfiles,
];

export async function loadScanContext(
  projectPath: string,
  fs: FileSystemAdapter,
): Promise<ScanContext> {
  const ctx: ScanContext = { projectPath, fs };

  const pkgPath = joinPath(projectPath, "package.json");
  if (await fs.exists(pkgPath)) {
    const content = await fs.readFile(pkgPath);
    ctx.packageJson = parseJsonSafe<PackageJson>(content) ?? undefined;
  }

  const configCandidates = ["app.json", "app.config.json"];
  for (const file of configCandidates) {
    const path = joinPath(projectPath, file);
    if (await fs.exists(path)) {
      const content = await fs.readFile(path);
      const parsed = parseJsonSafe<AppJson>(content);
      if (parsed?.expo) {
        ctx.appConfig = parsed.expo;
        ctx.appConfigPath = path;
        break;
      }
    }
  }

  if (!ctx.appConfig) {
    for (const file of ["app.config.js", "app.config.ts"]) {
      const path = joinPath(projectPath, file);
      if (await fs.exists(path)) {
        ctx.appConfigPath = path;
        const content = await fs.readFile(path);
        const rvMatch = content.match(/runtimeVersion\s*[:=]\s*['"]([^'"]+)['"]/);
        const iconMatch = content.match(/icon\s*[:=]\s*['"]([^'"]+)['"]/);
        const bundleMatch = content.match(/bundleIdentifier\s*[:=]\s*['"]([^'"]+)['"]/);
        const packageMatch = content.match(/package\s*[:=]\s*['"]([^'"]+)['"]/);
        ctx.appConfig = {
          runtimeVersion: rvMatch?.[1],
          icon: iconMatch?.[1],
          ios: bundleMatch ? { bundleIdentifier: bundleMatch[1] } : undefined,
          android: packageMatch ? { package: packageMatch[1] } : undefined,
        };
        break;
      }
    }
  }

  const easPath = joinPath(projectPath, "eas.json");
  if (await fs.exists(easPath)) {
    const content = await fs.readFile(easPath);
    ctx.easJson = parseJsonSafe<EasJson>(content) ?? undefined;
  }

  return ctx;
}

export type { PackageJson, ExpoConfig, EasJson };
