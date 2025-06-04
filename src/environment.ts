import { type IAgentRuntime, parseBooleanFromText } from "@elizaos/core";
import { ZodError, z } from "zod";

/**
 * This schema defines all required/optional environment settings,
 * including new fields like TWITTER_SPACES_ENABLE.
 */
/**
 * Schema definition for Twitter environment variables
 */
export const twitterEnvSchema = z.object({
  TWITTER_DRY_RUN: z.boolean(),
  TWITTER_USERNAME: z.string().min(1, "X/Twitter username is required"),
  TWITTER_PASSWORD: z.string().min(1, "X/Twitter password is required"),
  TWITTER_EMAIL: z.string().email("Valid X/Twitter email is required"),
  TWITTER_2FA_SECRET: z.string().default(undefined),
  TWITTER_RETRY_LIMIT: z.number().int(),
  TWITTER_POLL_INTERVAL: z.number().int(),
  TWITTER_TARGET_USERS: z.string().default(""),
  TWITTER_ENABLE_POST_GENERATION: z.boolean(),
  TWITTER_POST_INTERVAL_MIN: z.number().int(),
  TWITTER_POST_INTERVAL_MAX: z.number().int(),
  TWITTER_POST_IMMEDIATELY: z.boolean(),
  TWITTER_SPACES_ENABLE: z.boolean().default(false),
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
  targetUsersConfig: string
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
    (target) => target.toLowerCase().replace(/^@/, "") === normalizedUsername
  );
}

function safeParseInt(
  value: string | undefined | null,
  defaultValue: number
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
  config: Partial<TwitterConfig> = {}
): Promise<TwitterConfig> {
  try {
    const twitterConfig = {
      TWITTER_DRY_RUN:
        parseBooleanFromText(
          runtime.getSetting("TWITTER_DRY_RUN") || process.env.TWITTER_DRY_RUN
        ) ?? false,

      TWITTER_USERNAME:
        runtime.getSetting("TWITTER_USERNAME") || process.env.TWITTER_USERNAME,

      TWITTER_PASSWORD:
        runtime.getSetting("TWITTER_PASSWORD") || process.env.TWITTER_PASSWORD,

      TWITTER_EMAIL:
        runtime.getSetting("TWITTER_EMAIL") || process.env.TWITTER_EMAIL,

      TWITTER_2FA_SECRET:
        runtime.getSetting("TWITTER_2FA_SECRET") ||
        process.env.TWITTER_2FA_SECRET ||
        "",

      // int
      TWITTER_RETRY_LIMIT: safeParseInt(
        runtime.getSetting("TWITTER_RETRY_LIMIT") ||
          process.env.TWITTER_RETRY_LIMIT,
        5
      ),

      // int in seconds
      TWITTER_POLL_INTERVAL: safeParseInt(
        runtime.getSetting("TWITTER_POLL_INTERVAL") ||
          process.env.TWITTER_POLL_INTERVAL,
        120 // 2m
      ),

      // string - comma-separated list of target users
      TWITTER_TARGET_USERS:
        runtime.getSetting("TWITTER_TARGET_USERS") ||
        process.env.TWITTER_TARGET_USERS ||
        "",

      // bool
      TWITTER_ENABLE_POST_GENERATION:
        parseBooleanFromText(
          runtime.getSetting("TWITTER_ENABLE_POST_GENERATION") ||
            process.env.TWITTER_ENABLE_POST_GENERATION
        ) ?? true,

      // int in minutes
      TWITTER_POST_INTERVAL_MIN: safeParseInt(
        runtime.getSetting("TWITTER_POST_INTERVAL_MIN") ||
          process.env.TWITTER_POST_INTERVAL_MIN,
        90 // 1.5 hours
      ),

      // int in minutes
      TWITTER_POST_INTERVAL_MAX: safeParseInt(
        runtime.getSetting("TWITTER_POST_INTERVAL_MAX") ||
          process.env.TWITTER_POST_INTERVAL_MAX,
        180 // 3 hours
      ),

      // bool
      TWITTER_POST_IMMEDIATELY:
        parseBooleanFromText(
          runtime.getSetting("TWITTER_POST_IMMEDIATELY") ||
            process.env.TWITTER_POST_IMMEDIATELY
        ) ?? false,

      TWITTER_SPACES_ENABLE:
        parseBooleanFromText(
          runtime.getSetting("TWITTER_SPACES_ENABLE") ||
            process.env.TWITTER_SPACES_ENABLE
        ) ?? false,
      ...config,
    };

    return twitterEnvSchema.parse(twitterConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(
        `X/Twitter configuration validation failed:\n${errorMessages}`
      );
    }
    throw error;
  }
}
