import { type IAgentRuntime, logger } from "@elizaos/core";
import { TwitterInteractionClient } from "./interactions";
import { TwitterPostClient } from "./post";
import { TwitterTimelineClient } from "./timeline";
import { TwitterDiscoveryClient } from "./discovery";
import { validateTwitterConfig } from "./environment";
import { ClientBase } from "./base";
import { TwitterService } from "./services/twitter.service.js";
import { postTweetAction } from "./actions/postTweet.js";
import type { ITwitterClient } from "./types";

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - interaction: handling mentions, replies, and autonomous targeting
 * - timeline: processing timeline for actions (likes, retweets, replies)
 * - discovery: autonomous content discovery and engagement
 */
export class TwitterClientInstance implements ITwitterClient {
  client: ClientBase;
  post: TwitterPostClient;
  interaction: TwitterInteractionClient;
  timeline?: TwitterTimelineClient;
  discovery?: TwitterDiscoveryClient;
  service: TwitterService;

  constructor(runtime: IAgentRuntime, state: any) {
    // Pass twitterConfig to the base client
    this.client = new ClientBase(runtime, state);

    // Posting logic
    const postEnabledSetting = runtime.getSetting("TWITTER_ENABLE_POST");
    logger.debug(`TWITTER_ENABLE_POST setting value: ${JSON.stringify(postEnabledSetting)}, type: ${typeof postEnabledSetting}`);
    
    const postEnabled = postEnabledSetting === "true" || postEnabledSetting === true;
    
    if (postEnabled) {
      logger.info("Twitter posting is ENABLED - creating post client");
      this.post = new TwitterPostClient(this.client, runtime, state);
    } else {
      logger.info("Twitter posting is DISABLED - set TWITTER_ENABLE_POST=true to enable automatic posting");
    }

    // Mentions and interactions
    const repliesEnabled = runtime.getSetting("TWITTER_ENABLE_REPLIES") !== "false";
    
    if (repliesEnabled) {
      logger.info("Twitter replies/interactions are ENABLED");
      this.interaction = new TwitterInteractionClient(
        this.client,
        runtime,
        state,
      );
    } else {
      logger.info("Twitter replies/interactions are DISABLED");
    }

    // Timeline actions (likes, retweets, replies)
    const actionsEnabled = runtime.getSetting("TWITTER_ENABLE_ACTIONS") === "true";
    
    if (actionsEnabled) {
      logger.info("Twitter timeline actions are ENABLED");
      this.timeline = new TwitterTimelineClient(this.client, runtime, state);
    } else {
      logger.info("Twitter timeline actions are DISABLED");
    }

    // Discovery service for autonomous content discovery
    const discoveryEnabled = runtime.getSetting("TWITTER_ENABLE_DISCOVERY") === "true" ||
                           (actionsEnabled && runtime.getSetting("TWITTER_ENABLE_DISCOVERY") !== "false");
    
    if (discoveryEnabled) {
      logger.info("Twitter discovery service is ENABLED");
      this.discovery = new TwitterDiscoveryClient(this.client, runtime, state);
    } else {
      logger.info("Twitter discovery service is DISABLED - set TWITTER_ENABLE_DISCOVERY=true to enable");
    }

    this.service = TwitterService.getInstance();
  }
}

async function startTwitterClient(runtime: IAgentRuntime): Promise<void> {
  try {
    logger.log("🔧 Initializing Twitter plugin...");

    await validateTwitterConfig(runtime);

    logger.log("✅ Twitter configuration validated successfully");

    const twitterClient = new TwitterClientInstance(runtime, {});

    await twitterClient.client.init();

    // Add to service map
    runtime.registerService(TwitterService);

    // Start appropriate services based on configuration
    if (twitterClient.post) {
      logger.log("📮 Starting Twitter post client...");
      await twitterClient.post.start();
    }

    if (twitterClient.interaction) {
      logger.log("💬 Starting Twitter interaction client...");
      await twitterClient.interaction.start();
    }

    if (twitterClient.timeline) {
      logger.log("📊 Starting Twitter timeline client...");
      await twitterClient.timeline.start();
    }

    if (twitterClient.discovery) {
      logger.log("🔍 Starting Twitter discovery client...");
      await twitterClient.discovery.start();
    }

    logger.log("✅ Twitter plugin started successfully");
  } catch (error) {
    logger.error("🚨 Failed to start Twitter plugin:", error);
    throw error;
  }
}

export const TwitterPlugin = {
  name: "twitter",
  description: "Twitter client with posting, interactions, and timeline actions",
  actions: [postTweetAction],
  services: [TwitterService],
  init: startTwitterClient,
};

export default TwitterPlugin;
