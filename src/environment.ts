import { type IAgentRuntime, parseBooleanFromText } from "@elizaos/core";
import { ZodError, z } from "zod";

/**
 * This schema defines all required/optional environment settings.
 */
/**
 * Schema definition for Twitter environment variables
 */
export const twitterEnvSchema = z.object({
  TWITTER_API_KEY: z.string().optional(),
  TWITTER_API_SECRET_KEY: z.string().optional(),
  TWITTER_ACCESS_TOKEN: z.string().optional(),
  TWITTER_ACCESS_TOKEN_SECRET: z.string().optional(),
  TWITTER_TARGET_USERS: z.string().default(""),
  TWITTER_RETRY_LIMIT: z.string().default("5"),
  TWITTER_POLL_INTERVAL: z.string().default("120"),
  TWITTER_SEARCH_ENABLE: z.string().default("true"),
  TWITTER_DRY_RUN: z.string().default("false"),
  TWITTER_POST_ENABLE: z.string().default("false"),
  TWITTER_POST_INTERVAL_MIN: z.string().default("90"),
  TWITTER_POST_INTERVAL_MAX: z.string().default("180"),
  TWITTER_POST_IMMEDIATELY: z.string().default("false"),
  TWITTER_INTERACTION_INTERVAL_MIN: z.string().default("15"),
  TWITTER_INTERACTION_INTERVAL_MAX: z.string().default("30"),
  TWITTER_TIMELINE_ALGORITHM: z
    .enum(["latest", "weighted"])
    .default("weighted"),
  TWITTER_TIMELINE_USER_BASED_WEIGHT: z.string().default("3"),
  TWITTER_TIMELINE_TIME_BASED_WEIGHT: z.string().default("2"),
  TWITTER_TIMELINE_RELEVANCE_WEIGHT: z.string().default("5"),
  TWITTER_MAX_TWEET_LENGTH: z.string().default("4000"),
  TWITTER_MAX_INTERACTIONS_PER_RUN: z.string().default("10"),
  TWITTER_DM_ONLY: z.string().default("false"),
  TWITTER_ENABLE_ACTION_PROCESSING: z.string().default("false"),
  TWITTER_ACTION_INTERVAL: z.string().default("240"),
  TWITTER_AUTO_RESPOND_MENTIONS: z.string().default("true"),
  TWITTER_AUTO_RESPOND_REPLIES: z.string().default("true"),
  TWITTER_POST_INTERVAL_VARIANCE: z.string().default("0.2"),
  TWITTER_INTERACTION_INTERVAL_VARIANCE: z.string().default("0.3"),
});

export type TwitterConfig = z.infer<typeof twitterEnvSchema>;

/**
 * Helper to parse a comma-separated list of Twitter usernames
 * (already present in your code).
 */
function parseTargetUsers(targetUsersStr?: string | null): string[] {
  if (!targetUsersStr?.trim()) {
    return [];
  }
  return targetUsersStr
    .split(",")
    .map((user) => user.trim())
    .filter(Boolean);
}

/**
 * Check if a user should be targeted for interactions based on TWITTER_TARGET_USERS
 * Supports wildcard "*" to target all users
 */
export function shouldTargetUser(
  username: string,
  targetUsersConfig: string,
): boolean {
  if (!targetUsersConfig?.trim()) {
    return true; // If no target users specified, interact with everyone
  }

  const targetUsers = parseTargetUsers(targetUsersConfig);

  // If wildcard is specified, target everyone
  if (targetUsers.includes("*")) {
    return true;
  }

  // Check if the username (without @) is in the target list
  const normalizedUsername = username.toLowerCase().replace(/^@/, "");
  return targetUsers.some(
    (target) => target.toLowerCase().replace(/^@/, "") === normalizedUsername,
  );
}

function safeParseInt(
  value: string | undefined | null,
  defaultValue: number,
): number {
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : Math.max(1, parsed);
}

/**
 * Validates or constructs a TwitterConfig object using zod,
 * taking values from the IAgentRuntime or process.env as needed.
 */
// This also is organized to serve as a point of documentation for the client
// most of the inputs from the framework (env/character)

// we also do a lot of typing/prompt here
// so we can do it once and only once per character
export async function validateTwitterConfig(
  runtime: IAgentRuntime,
  config: Partial<TwitterConfig> = {},
): Promise<TwitterConfig> {
  try {
    const getConfig = (key: keyof TwitterConfig): string | undefined => {
      return (
        config[key] || runtime.getSetting(key) || process.env[key] || undefined
      );
    };

    const targetUsersStr = getConfig("TWITTER_TARGET_USERS");
    const targetUsers = parseTargetUsers(targetUsersStr) || [];

    const validatedConfig: TwitterConfig = {
      TWITTER_API_KEY: getConfig("TWITTER_API_KEY") || "",
      TWITTER_API_SECRET_KEY: getConfig("TWITTER_API_SECRET_KEY") || "",
      TWITTER_ACCESS_TOKEN: getConfig("TWITTER_ACCESS_TOKEN") || "",
      TWITTER_ACCESS_TOKEN_SECRET:
        getConfig("TWITTER_ACCESS_TOKEN_SECRET") || "",
      TWITTER_TARGET_USERS: targetUsersStr || "",
      TWITTER_RETRY_LIMIT: String(
        safeParseInt(getConfig("TWITTER_RETRY_LIMIT"), 5),
      ),
      TWITTER_POLL_INTERVAL: String(
        safeParseInt(getConfig("TWITTER_POLL_INTERVAL"), 120),
      ),
      TWITTER_SEARCH_ENABLE: String(
        getConfig("TWITTER_SEARCH_ENABLE") !== undefined
          ? getConfig("TWITTER_SEARCH_ENABLE")?.toLowerCase() === "true"
          : true, // Default to true when not set
      ),
      TWITTER_DRY_RUN: String(
        getConfig("TWITTER_DRY_RUN")?.toLowerCase() === "true",
      ),
      TWITTER_POST_ENABLE: String(
        getConfig("TWITTER_POST_ENABLE")?.toLowerCase() === "true",
      ),
      TWITTER_POST_INTERVAL_MIN: String(
        safeParseInt(getConfig("TWITTER_POST_INTERVAL_MIN"), 90),
      ),
      TWITTER_POST_INTERVAL_MAX: String(
        safeParseInt(getConfig("TWITTER_POST_INTERVAL_MAX"), 180),
      ),
      TWITTER_POST_IMMEDIATELY: String(
        getConfig("TWITTER_POST_IMMEDIATELY")?.toLowerCase() === "true",
      ),
      TWITTER_INTERACTION_INTERVAL_MIN: String(
        safeParseInt(getConfig("TWITTER_INTERACTION_INTERVAL_MIN"), 15),
      ),
      TWITTER_INTERACTION_INTERVAL_MAX: String(
        safeParseInt(getConfig("TWITTER_INTERACTION_INTERVAL_MAX"), 30),
      ),
      TWITTER_TIMELINE_ALGORITHM: (getConfig("TWITTER_TIMELINE_ALGORITHM") ===
      "latest"
        ? "latest"
        : "weighted") as "latest" | "weighted",
      TWITTER_TIMELINE_USER_BASED_WEIGHT: String(
        safeParseInt(getConfig("TWITTER_TIMELINE_USER_BASED_WEIGHT"), 3),
      ),
      TWITTER_TIMELINE_TIME_BASED_WEIGHT: String(
        safeParseInt(getConfig("TWITTER_TIMELINE_TIME_BASED_WEIGHT"), 2),
      ),
      TWITTER_TIMELINE_RELEVANCE_WEIGHT: String(
        safeParseInt(getConfig("TWITTER_TIMELINE_RELEVANCE_WEIGHT"), 5),
      ),
      TWITTER_MAX_TWEET_LENGTH: String(
        safeParseInt(getConfig("TWITTER_MAX_TWEET_LENGTH"), 4000),
      ),
      TWITTER_MAX_INTERACTIONS_PER_RUN: String(
        safeParseInt(getConfig("TWITTER_MAX_INTERACTIONS_PER_RUN"), 10),
      ),
      TWITTER_DM_ONLY: String(
        getConfig("TWITTER_DM_ONLY")?.toLowerCase() === "true",
      ),
      TWITTER_ENABLE_ACTION_PROCESSING: String(
        getConfig("TWITTER_ENABLE_ACTION_PROCESSING")?.toLowerCase() === "true",
      ),
      TWITTER_ACTION_INTERVAL: String(
        safeParseInt(getConfig("TWITTER_ACTION_INTERVAL"), 240),
      ),
      TWITTER_AUTO_RESPOND_MENTIONS: String(
        getConfig("TWITTER_AUTO_RESPOND_MENTIONS")?.toLowerCase() === "true",
      ),
      TWITTER_AUTO_RESPOND_REPLIES: String(
        getConfig("TWITTER_AUTO_RESPOND_REPLIES")?.toLowerCase() === "true",
      ),
      TWITTER_POST_INTERVAL_VARIANCE: String(
        Number(getConfig("TWITTER_POST_INTERVAL_VARIANCE") || "0.2"),
      ),
      TWITTER_INTERACTION_INTERVAL_VARIANCE: String(
        Number(getConfig("TWITTER_INTERACTION_INTERVAL_VARIANCE") || "0.3"),
      ),
    };

    // Only require API keys, not username/password
    if (
      !validatedConfig.TWITTER_API_KEY ||
      !validatedConfig.TWITTER_API_SECRET_KEY ||
      !validatedConfig.TWITTER_ACCESS_TOKEN ||
      !validatedConfig.TWITTER_ACCESS_TOKEN_SECRET
    ) {
      throw new Error(
        "Twitter API credentials are required. Please set TWITTER_API_KEY, TWITTER_API_SECRET_KEY, TWITTER_ACCESS_TOKEN, and TWITTER_ACCESS_TOKEN_SECRET",
      );
    }

    return twitterEnvSchema.parse(validatedConfig);
  } catch (error) {
    const errorMessage =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Unknown error";
    throw new Error(`Twitter configuration validation failed: ${errorMessage}`);
  }
}

/**
 * Load configuration from file
 * @param configPath - Path to the configuration file (optional)
 * @returns TwitterConfig object
 */
export function loadConfig(configPath?: string): TwitterConfig {
  const fileConfig = loadConfigFromFile(configPath);

  return {
    ...getDefaultConfig(),
    ...fileConfig,
    ...getEnvConfig(),
  };
}

/**
 * Get configuration from environment variables
 * @returns Partial<TwitterConfig>
 */
function getEnvConfig(): Partial<TwitterConfig> {
  const config: Partial<TwitterConfig> = {};

  const getConfig = (key: keyof TwitterConfig): string | undefined => {
    if (typeof process !== "undefined" && process.env) {
      return process.env[key];
    }
    return undefined;
  };

  // Required API credentials
  if (getConfig("TWITTER_API_KEY")) {
    config.TWITTER_API_KEY = getConfig("TWITTER_API_KEY");
  }
  if (getConfig("TWITTER_API_SECRET_KEY")) {
    config.TWITTER_API_SECRET_KEY = getConfig("TWITTER_API_SECRET_KEY");
  }
  if (getConfig("TWITTER_ACCESS_TOKEN")) {
    config.TWITTER_ACCESS_TOKEN = getConfig("TWITTER_ACCESS_TOKEN");
  }
  if (getConfig("TWITTER_ACCESS_TOKEN_SECRET")) {
    config.TWITTER_ACCESS_TOKEN_SECRET = getConfig(
      "TWITTER_ACCESS_TOKEN_SECRET",
    );
  }

  // Optional settings
  if (getConfig("TWITTER_TARGET_USERS")) {
    config.TWITTER_TARGET_USERS = getConfig("TWITTER_TARGET_USERS");
  }
  if (getConfig("TWITTER_RETRY_LIMIT")) {
    config.TWITTER_RETRY_LIMIT = getConfig("TWITTER_RETRY_LIMIT");
  }
  if (getConfig("TWITTER_POLL_INTERVAL")) {
    config.TWITTER_POLL_INTERVAL = getConfig("TWITTER_POLL_INTERVAL");
  }
  if (getConfig("TWITTER_SEARCH_ENABLE")) {
    config.TWITTER_SEARCH_ENABLE = getConfig("TWITTER_SEARCH_ENABLE");
  }
  if (getConfig("TWITTER_DRY_RUN")) {
    config.TWITTER_DRY_RUN = getConfig("TWITTER_DRY_RUN");
  }

  return config;
}

/**
 * Get default configuration
 * @returns TwitterConfig with default values
 */
function getDefaultConfig(): TwitterConfig {
  const getConfig = (key: keyof TwitterConfig): string | undefined => {
    if (typeof process !== "undefined" && process.env) {
      return process.env[key];
    }
    return undefined;
  };

  return {
    TWITTER_API_KEY: getConfig("TWITTER_API_KEY") || "",
    TWITTER_API_SECRET_KEY: getConfig("TWITTER_API_SECRET_KEY") || "",
    TWITTER_ACCESS_TOKEN: getConfig("TWITTER_ACCESS_TOKEN") || "",
    TWITTER_ACCESS_TOKEN_SECRET: getConfig("TWITTER_ACCESS_TOKEN_SECRET") || "",
    TWITTER_TARGET_USERS: getConfig("TWITTER_TARGET_USERS") || "",
    TWITTER_RETRY_LIMIT: getConfig("TWITTER_RETRY_LIMIT") || "5",
    TWITTER_POLL_INTERVAL: getConfig("TWITTER_POLL_INTERVAL") || "120",
    TWITTER_SEARCH_ENABLE: getConfig("TWITTER_SEARCH_ENABLE") || "true",
    TWITTER_DRY_RUN: getConfig("TWITTER_DRY_RUN") || "false",
    TWITTER_POST_ENABLE: getConfig("TWITTER_POST_ENABLE") || "false",
    TWITTER_POST_INTERVAL_MIN: getConfig("TWITTER_POST_INTERVAL_MIN") || "90",
    TWITTER_POST_INTERVAL_MAX: getConfig("TWITTER_POST_INTERVAL_MAX") || "180",
    TWITTER_POST_IMMEDIATELY: getConfig("TWITTER_POST_IMMEDIATELY") || "false",
    TWITTER_INTERACTION_INTERVAL_MIN:
      getConfig("TWITTER_INTERACTION_INTERVAL_MIN") || "15",
    TWITTER_INTERACTION_INTERVAL_MAX:
      getConfig("TWITTER_INTERACTION_INTERVAL_MAX") || "30",
    TWITTER_TIMELINE_ALGORITHM: (getConfig("TWITTER_TIMELINE_ALGORITHM") ===
    "latest"
      ? "latest"
      : "weighted") as "latest" | "weighted",
    TWITTER_TIMELINE_USER_BASED_WEIGHT:
      getConfig("TWITTER_TIMELINE_USER_BASED_WEIGHT") || "3",
    TWITTER_TIMELINE_TIME_BASED_WEIGHT:
      getConfig("TWITTER_TIMELINE_TIME_BASED_WEIGHT") || "2",
    TWITTER_TIMELINE_RELEVANCE_WEIGHT:
      getConfig("TWITTER_TIMELINE_RELEVANCE_WEIGHT") || "5",
    TWITTER_MAX_TWEET_LENGTH: getConfig("TWITTER_MAX_TWEET_LENGTH") || "4000",
    TWITTER_MAX_INTERACTIONS_PER_RUN:
      getConfig("TWITTER_MAX_INTERACTIONS_PER_RUN") || "10",
    TWITTER_DM_ONLY: getConfig("TWITTER_DM_ONLY") || "false",
    TWITTER_ENABLE_ACTION_PROCESSING:
      getConfig("TWITTER_ENABLE_ACTION_PROCESSING") || "false",
    TWITTER_ACTION_INTERVAL: getConfig("TWITTER_ACTION_INTERVAL") || "240",
    TWITTER_AUTO_RESPOND_MENTIONS:
      getConfig("TWITTER_AUTO_RESPOND_MENTIONS") || "true",
    TWITTER_AUTO_RESPOND_REPLIES:
      getConfig("TWITTER_AUTO_RESPOND_REPLIES") || "true",
    TWITTER_POST_INTERVAL_VARIANCE:
      getConfig("TWITTER_POST_INTERVAL_VARIANCE") || "0.2",
    TWITTER_INTERACTION_INTERVAL_VARIANCE:
      getConfig("TWITTER_INTERACTION_INTERVAL_VARIANCE") || "0.3",
  };
}

/**
 * Load configuration from file
 * @param configPath - Path to configuration file
 * @returns Partial<TwitterConfig>
 */
function loadConfigFromFile(configPath?: string): Partial<TwitterConfig> {
  // This is a placeholder for file-based configuration
  // Implementation would depend on your specific needs
  return {};
}

/**
 * Validate configuration
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: unknown): TwitterConfig {
  return twitterEnvSchema.parse(config);
}
