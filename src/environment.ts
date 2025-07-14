import { type IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

/**
 * Simplified Twitter environment schema
 * All time intervals are in minutes for consistency
 */
export const twitterEnvSchema = z.object({
  // Required API credentials
  TWITTER_API_KEY: z.string(),
  TWITTER_API_SECRET_KEY: z.string(),
  TWITTER_ACCESS_TOKEN: z.string(),
  TWITTER_ACCESS_TOKEN_SECRET: z.string(),
  
  // Core configuration
  TWITTER_DRY_RUN: z.string().default("false"),
  TWITTER_TARGET_USERS: z.string().default(""), // comma-separated list, empty = all
  
  // Feature toggles
  TWITTER_ENABLE_POST: z.string().default("false"),
  TWITTER_ENABLE_REPLIES: z.string().default("true"),
  TWITTER_ENABLE_ACTIONS: z.string().default("false"), // likes, retweets, quotes
  
  // Timing configuration (all in minutes)
  TWITTER_POST_INTERVAL: z.string().default("120"), // minutes between posts
  TWITTER_ENGAGEMENT_INTERVAL: z.string().default("30"), // minutes between all interactions
  
  // Limits
  TWITTER_MAX_ENGAGEMENTS_PER_RUN: z.string().default("10"),
  TWITTER_MAX_TWEET_LENGTH: z.string().default("280"), // standard tweet length
  
  // Advanced
  TWITTER_RETRY_LIMIT: z.string().default("5"),
});

// Remove deprecated
delete process.env.TWITTER_SEARCH_ENABLE;
delete process.env.TWITTER_POST_ENABLE;

export type TwitterConfig = z.infer<typeof twitterEnvSchema>;

/**
 * Parse safe integer with fallback
 */
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Helper to parse a comma-separated list of Twitter usernames
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
 * Check if a user should be targeted for interactions
 * Empty list means target everyone
 * "*" wildcard means target everyone explicitly
 */
export function shouldTargetUser(
  username: string,
  targetUsersConfig: string,
): boolean {
  if (!targetUsersConfig?.trim()) {
    return true; // Empty = interact with everyone
  }

  const targetUsers = parseTargetUsers(targetUsersConfig);
  
  if (targetUsers.includes("*")) {
    return true; // Wildcard = everyone
  }

  // Check if the username (without @) is in the target list
  const normalizedUsername = username.toLowerCase().replace(/^@/, "");
  return targetUsers.some(
    (target) => target.toLowerCase().replace(/^@/, "") === normalizedUsername,
  );
}

/**
 * Get parsed target users list
 */
export function getTargetUsers(targetUsersConfig: string): string[] {
  const users = parseTargetUsers(targetUsersConfig);
  // Filter out wildcard since it's a special case
  return users.filter(u => u !== "*");
}

/**
 * Helper function to get a setting from runtime or environment
 */
function getSetting(
  runtime: IAgentRuntime,
  key: string,
  defaultValue?: string
): string | undefined {
  return runtime.getSetting(key) ?? process.env[key] ?? defaultValue;
}

/**
 * Validates Twitter configuration using simplified schema
 */
export async function validateTwitterConfig(
  runtime: IAgentRuntime,
  config: Partial<TwitterConfig> = {},
): Promise<TwitterConfig> {
  try {
    const validatedConfig: TwitterConfig = {
      TWITTER_API_KEY: config.TWITTER_API_KEY ?? getSetting(runtime, "TWITTER_API_KEY") ?? "",
      TWITTER_API_SECRET_KEY: config.TWITTER_API_SECRET_KEY ?? getSetting(runtime, "TWITTER_API_SECRET_KEY") ?? "",
      TWITTER_ACCESS_TOKEN: config.TWITTER_ACCESS_TOKEN ?? getSetting(runtime, "TWITTER_ACCESS_TOKEN") ?? "",
      TWITTER_ACCESS_TOKEN_SECRET: config.TWITTER_ACCESS_TOKEN_SECRET ?? getSetting(runtime, "TWITTER_ACCESS_TOKEN_SECRET") ?? "",
      TWITTER_DRY_RUN: String((config.TWITTER_DRY_RUN ?? getSetting(runtime, "TWITTER_DRY_RUN") ?? "false").toLowerCase() === "true"),
      TWITTER_TARGET_USERS: config.TWITTER_TARGET_USERS ?? getSetting(runtime, "TWITTER_TARGET_USERS") ?? "",
      TWITTER_ENABLE_POST: String((config.TWITTER_ENABLE_POST ?? getSetting(runtime, "TWITTER_ENABLE_POST") ?? "false").toLowerCase() === "true"),
      TWITTER_ENABLE_REPLIES: String(
        config.TWITTER_ENABLE_REPLIES !== undefined
          ? config.TWITTER_ENABLE_REPLIES.toLowerCase() === "true"
          : (getSetting(runtime, "TWITTER_ENABLE_REPLIES") ?? "true").toLowerCase() === "true"
      ),
      TWITTER_ENABLE_ACTIONS: String((config.TWITTER_ENABLE_ACTIONS ?? getSetting(runtime, "TWITTER_ENABLE_ACTIONS") ?? "false").toLowerCase() === "true"),
      TWITTER_POST_INTERVAL: String(safeParseInt(config.TWITTER_POST_INTERVAL ?? getSetting(runtime, "TWITTER_POST_INTERVAL"), 120)),
      TWITTER_ENGAGEMENT_INTERVAL: String(safeParseInt(config.TWITTER_ENGAGEMENT_INTERVAL ?? getSetting(runtime, "TWITTER_ENGAGEMENT_INTERVAL"), 30)),
      TWITTER_MAX_ENGAGEMENTS_PER_RUN: String(safeParseInt(config.TWITTER_MAX_ENGAGEMENTS_PER_RUN ?? getSetting(runtime, "TWITTER_MAX_ENGAGEMENTS_PER_RUN"), 10)),
      TWITTER_MAX_TWEET_LENGTH: String(safeParseInt(config.TWITTER_MAX_TWEET_LENGTH ?? getSetting(runtime, "TWITTER_MAX_TWEET_LENGTH"), 280)),
      TWITTER_RETRY_LIMIT: String(safeParseInt(config.TWITTER_RETRY_LIMIT ?? getSetting(runtime, "TWITTER_RETRY_LIMIT"), 5)),
    };

    // Validate required credentials
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
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join(", ");
      throw new Error(
        `Twitter configuration validation failed: ${errorMessages}`,
      );
    }
    throw error;
  }
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

  // Map all environment variables
  Object.keys(twitterEnvSchema.shape).forEach((key) => {
    const value = getConfig(key as keyof TwitterConfig);
    if (value !== undefined) {
      config[key as keyof TwitterConfig] = value;
    }
  });

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
    TWITTER_DRY_RUN: getConfig("TWITTER_DRY_RUN") || "false",
    TWITTER_TARGET_USERS: getConfig("TWITTER_TARGET_USERS") || "",
    TWITTER_ENABLE_POST: getConfig("TWITTER_ENABLE_POST") || "false",
    TWITTER_ENABLE_REPLIES: getConfig("TWITTER_ENABLE_REPLIES") || "true",
    TWITTER_ENABLE_ACTIONS: getConfig("TWITTER_ENABLE_ACTIONS") || "false",
    TWITTER_POST_INTERVAL: getConfig("TWITTER_POST_INTERVAL") || "120",
    TWITTER_ENGAGEMENT_INTERVAL: getConfig("TWITTER_ENGAGEMENT_INTERVAL") || "30",
    TWITTER_MAX_ENGAGEMENTS_PER_RUN: getConfig("TWITTER_MAX_ENGAGEMENTS_PER_RUN") || "10",
    TWITTER_MAX_TWEET_LENGTH: getConfig("TWITTER_MAX_TWEET_LENGTH") || "280",
    TWITTER_RETRY_LIMIT: getConfig("TWITTER_RETRY_LIMIT") || "5",
  };
}

/**
 * Load configuration from file (stub for future implementation)
 * @param configPath - Path to the configuration file (optional)
 * @returns Partial TwitterConfig object
 */
export function loadConfigFromFile(configPath?: string): Partial<TwitterConfig> {
  // For now, return empty config as file loading is not implemented
  return {};
}

/**
 * Load merged configuration from all sources
 * @param configPath - Path to the configuration file (optional)
 * @returns Complete TwitterConfig object
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
 * Validate configuration
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: unknown): TwitterConfig {
  return twitterEnvSchema.parse(config);
}
