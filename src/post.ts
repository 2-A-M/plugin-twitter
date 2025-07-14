import {
  ChannelType,
  type Content,
  EventType,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type UUID,
  createUniqueUuid,
  logger,
} from "@elizaos/core";
import type { ClientBase } from "./base";
import type { MediaData } from "./types";
import { TwitterEventTypes } from "./types";
import { sendTweet } from "./utils";
/**
 * Class representing a Twitter post client for generating and posting tweets.
 */
export class TwitterPostClient {
  client: ClientBase;
  runtime: IAgentRuntime;
  twitterUsername: string;
  private isDryRun: boolean;
  private state: any;
  private isRunning: boolean = false;

  /**
   * Constructor for initializing a new Twitter client with the provided client, runtime, and state
   * @param {ClientBase} client - The client used for interacting with Twitter API
   * @param {IAgentRuntime} runtime - The runtime environment for the agent
   * @param {any} state - The state object containing configuration settings
   */
  constructor(client: ClientBase, runtime: IAgentRuntime, state: any) {
    this.client = client;
    this.state = state;
    this.runtime = runtime;
    const dryRunSetting = this.state?.TWITTER_DRY_RUN ?? this.runtime.getSetting("TWITTER_DRY_RUN");
    this.isDryRun = dryRunSetting === true || dryRunSetting === "true" || 
                    (typeof dryRunSetting === "string" && dryRunSetting.toLowerCase() === "true");

    // Log configuration on initialization
    logger.log("Twitter Post Client Configuration:");
    logger.log(`- Dry Run Mode: ${this.isDryRun ? "Enabled" : "Disabled"}`);

    const postInterval = parseInt(
      this.state?.TWITTER_POST_INTERVAL || 
      this.runtime.getSetting("TWITTER_POST_INTERVAL") as string || 
      "120"
    );
    logger.log(`- Post Interval: ${postInterval} minutes`);
  }
  
  /**
   * Stops the Twitter post client
   */
  async stop() {
    logger.log("Stopping Twitter post client...");
    this.isRunning = false;
  }

  /**
   * Starts the Twitter post client, setting up a loop to periodically generate new tweets.
   */
  async start() {
    logger.log("Starting Twitter post client...");
    this.isRunning = true;

    const generateNewTweetLoop = async () => {
      if (!this.isRunning) {
        logger.log("Twitter post client stopped, exiting loop");
        return;
      }
      
      // Get post interval in minutes
      const postIntervalMinutes = parseInt(
        this.state?.TWITTER_POST_INTERVAL || 
        this.runtime.getSetting("TWITTER_POST_INTERVAL") as string || 
        "120"
      );
      
      // Convert to milliseconds
      const interval = postIntervalMinutes * 60 * 1000;
      
      logger.info(`Next tweet scheduled in ${postIntervalMinutes} minutes`);

      await this.generateNewTweet();
      
      if (this.isRunning) {
        setTimeout(generateNewTweetLoop, interval);
      }
    };

    // Start the loop after a 1 minute delay to allow other services to initialize
    // Always post immediately for better UX
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.generateNewTweet();
    
    // Then start the regular interval
    const postIntervalMinutes = parseInt(
      this.state?.TWITTER_POST_INTERVAL || 
      this.runtime.getSetting("TWITTER_POST_INTERVAL") as string || 
      "120"
    );
    const interval = postIntervalMinutes * 60 * 1000;
    
    if (this.isRunning) {
      setTimeout(generateNewTweetLoop, interval);
    }
  }

  /**
   * Handles the creation and posting of a tweet by emitting standardized events.
   * This approach aligns with our platform-independent architecture.
   */
  async generateNewTweet() {
    logger.info("Attempting to generate new tweet...");
    
    try {
      // Create the timeline room ID for storing the post
      const userId = this.client.profile?.id;
      if (!userId) {
        logger.error("Cannot generate tweet: Twitter profile not available");
        return;
      }

      logger.info(`Generating tweet for user: ${this.client.profile?.username} (${userId})`);

      // Create standardized world and room IDs
      const worldId = createUniqueUuid(this.runtime, userId) as UUID;
      const roomId = createUniqueUuid(this.runtime, `${userId}-home`) as UUID;
      
      // Create a callback for handling the actual posting
      const callback: HandlerCallback = async (content: Content) => {
        logger.info("Tweet generation callback triggered");
        
        try {
          if (this.isDryRun) {
            logger.info(`[DRY RUN] Would post tweet: ${content.text}`);
            return [];
          }

          if (content.text.includes("Error: Missing")) {
            logger.error("Error: Missing some context", content);
            return [];
          }

          logger.info(`Posting tweet: ${content.text}`);

          // Post the tweet
          const result = await this.postToTwitter(
            content.text,
            content.mediaData as MediaData[],
          );

          // If result is null, it means we detected a duplicate tweet and skipped posting
          if (result === null) {
            logger.info("Skipped posting duplicate tweet");
            return [];
          }

          const tweetId = (result as any).id;
          logger.info(`Tweet posted successfully! ID: ${tweetId}`);

          if (result) {
            const postedTweetId = createUniqueUuid(this.runtime, tweetId);

            // Create memory for the posted tweet
            const postedMemory: Memory = {
              id: postedTweetId,
              entityId: this.runtime.agentId,
              agentId: this.runtime.agentId,
              roomId,
              content: {
                ...content,
                source: "twitter",
                channelType: ChannelType.FEED,
                type: "post",
                metadata: {
                  tweetId,
                  postedAt: Date.now(),
                },
              },
              createdAt: Date.now(),
            };

            await this.runtime.createMemory(postedMemory, "messages");

            return [postedMemory];
          }

          return [];
        } catch (error) {
          logger.error("Error in tweet generation callback:", error);
          return [];
        }
      };

      // Emit the event that will trigger the agent to generate content
      this.runtime.emitEvent(
        TwitterEventTypes.POST_GENERATED,
        {
          callback,
          entityId: this.runtime.agentId,
          userId,
          roomId,
          source: "twitter",
        },
      );
      
      logger.info("POST_GENERATED event emitted successfully");
    } catch (error) {
      logger.error("Error generating tweet:", error);
    }
  }

  /**
   * Posts content to Twitter
   * @param {string} text The tweet text to post
   * @param {MediaData[]} mediaData Optional media to attach to the tweet
   * @returns {Promise<any>} The result from the Twitter API
   */
  private async postToTwitter(
    text: string,
    mediaData: MediaData[] = [],
  ): Promise<any> {
    try {
      // Check if this tweet is a duplicate of the last one
      const lastPost = await this.runtime.getCache<any>(
        `twitter/${this.client.profile?.username}/lastPost`,
      );
      if (lastPost) {
        // Fetch the last tweet to compare content
        const lastTweet = await this.client.getTweet(lastPost.id);
        if (lastTweet && lastTweet.text === text) {
          logger.warn(
            "Tweet is a duplicate of the last post. Skipping to avoid duplicate.",
          );
          return null;
        }
      }

      // Handle media uploads if needed
      const mediaIds: string[] = [];

      if (mediaData && mediaData.length > 0) {
        for (const media of mediaData) {
          try {
            // TODO: Media upload will need to be updated to use the new API
            // For now, just log a warning that media upload is not supported
            logger.warn(
              "Media upload not currently supported with the modern Twitter API",
            );
          } catch (error) {
            logger.error("Error uploading media:", error);
          }
        }
      }

      const result = await sendTweet(this.client, text, mediaData);

      // Cache the new post to prevent duplicates
      await this.runtime.setCache(
        `twitter/${this.client.profile?.username}/lastPost`,
        {
          id: (result as any).id,
          text: text,
          timestamp: Date.now(),
        },
      );

      return result;
    } catch (error) {
      logger.error("Error posting to Twitter:", error);
      throw error;
    }
  }
}
