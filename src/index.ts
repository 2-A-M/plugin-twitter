import {
  ChannelType,
  type Entity,
  EventType,
  type IAgentRuntime,
  type Plugin,
  Role,
  type Room,
  Service,
  type UUID,
  type World,
  createUniqueUuid,
  logger,
} from "@elizaos/core";
import { ClientBase } from "./base";
import { TWITTER_SERVICE_NAME } from "./constants";
import type { TwitterConfig } from "./environment";
import { TwitterInteractionClient } from "./interactions";
import { TwitterPostClient } from "./post";
import { TwitterTimelineClient } from "./timeline";
import { ClientBaseTestSuite } from "./tests";
import { type ITwitterClient, TwitterEventTypes } from "./types";

logger.info(`Twitter plugin loaded with service name: ${TWITTER_SERVICE_NAME}`);

/**
 * A manager that orchestrates all specialized Twitter logic:
 * - client: base operations (login, timeline caching, etc.)
 * - post: autonomous posting logic
 * - search: searching tweets / replying logic
 * - interaction: handling mentions, replies
 * - space: launching and managing Twitter Spaces (optional)
 */
/**
 * TwitterClientInstance class that implements ITwitterClient interface.
 *
 * @class
 * @implements {ITwitterClient}
 */

export class TwitterClientInstance implements ITwitterClient {
  client: ClientBase;
  post: TwitterPostClient;
  interaction: TwitterInteractionClient;
  timeline?: TwitterTimelineClient;
  service: TwitterService;

  constructor(runtime: IAgentRuntime, state: any) {
    // Pass twitterConfig to the base client
    this.client = new ClientBase(runtime, state);

    // Posting logic - use TWITTER_POST_ENABLE instead
    const postEnableSetting = runtime.getSetting("TWITTER_POST_ENABLE");
    logger.info(`TWITTER_POST_ENABLE raw value: "${postEnableSetting}"`);
    logger.info(`TWITTER_POST_ENABLE type: ${typeof postEnableSetting}`);
    
    // Handle both boolean and string values
    const postEnabled = postEnableSetting === true || 
                       postEnableSetting === "true" || 
                       (typeof postEnableSetting === "string" && postEnableSetting.toLowerCase() === "true");
    
    if (postEnabled) {
      logger.info("Twitter posting is ENABLED - creating post client");
      this.post = new TwitterPostClient(this.client, runtime, state);
    } else {
      logger.info("Twitter posting is DISABLED - set TWITTER_POST_ENABLE=true to enable automatic posting");
    }

    // Mentions and interactions - check for TWITTER_SEARCH_ENABLE
    const searchEnabledSetting = runtime.getSetting("TWITTER_SEARCH_ENABLE");
    logger.info(`TWITTER_SEARCH_ENABLE raw value: "${searchEnabledSetting}"`);
    
    // Handle both boolean and string values
    const searchEnabled = searchEnabledSetting !== false && searchEnabledSetting !== "false";
    if (searchEnabled) {
      logger.info("Twitter search/interactions are ENABLED");
      this.interaction = new TwitterInteractionClient(
        this.client,
        runtime,
        state,
      );
    } else {
      logger.info("Twitter search/interactions are DISABLED");
    }

    // handle timeline - check if TWITTER_ENABLE_ACTION_PROCESSING is enabled
    const actionProcessingEnabled = runtime.getSetting("TWITTER_ENABLE_ACTION_PROCESSING") === "true";
    if (actionProcessingEnabled) {
      logger.info("Twitter action processing is ENABLED");
      this.timeline = new TwitterTimelineClient(this.client, runtime, state);
    } else {
      logger.info("Twitter action processing is DISABLED");
    }

    this.service = TwitterService.getInstance();
  }
}

export class TwitterService extends Service {
  static serviceType: string = TWITTER_SERVICE_NAME;
  capabilityDescription =
    "The agent is able to send and receive messages on twitter";
  private static instance: TwitterService;
  private clients: Map<string, TwitterClientInstance> = new Map();

  static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService();
    }
    return TwitterService.instance;
  }

  async createClient(
    runtime: IAgentRuntime,
    clientId: string,
    state: any,
  ): Promise<TwitterClientInstance> {
    try {
      // Check if client already exists
      const existingClient = this.getClient(clientId, runtime.agentId);
      if (existingClient) {
        logger.info(`Twitter client already exists for ${clientId}`);
        return existingClient;
      }

      // Create new client instance
      const client = new TwitterClientInstance(runtime, state);

      // Initialize the client
      await client.client.init();

      if (client.post) {
        await client.post.start();
      }

      if (client.interaction) {
        await client.interaction.start();
      }

      if (client.timeline) {
        await client.timeline.start();
      }

      // Store the client instance
      this.clients.set(this.getClientKey(clientId, runtime.agentId), client);

      // Emit standardized WORLD_JOINED event once we have client profile
      await this.emitServerJoinedEvent(runtime, client);

      logger.info(`Created Twitter client for ${clientId}`);
      return client;
    } catch (error) {
      logger.error(`Failed to create Twitter client for ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Emits a standardized WORLD_JOINED event for Twitter
   * @param runtime The agent runtime
   * @param client The Twitter client instance
   */
  private async emitServerJoinedEvent(
    runtime: IAgentRuntime,
    client: TwitterClientInstance,
  ): Promise<void> {
    try {
      if (!client.client.profile) {
        logger.warn(
          "Twitter profile not available yet, can't emit WORLD_JOINED event",
        );
        return;
      }

      const profile = client.client.profile;
      const twitterId = profile.id;
      const username = profile.username;

      // Create the world ID based on the twitter user ID
      const worldId = createUniqueUuid(runtime, twitterId) as UUID;

      // For Twitter, we create a single world representing the user's Twitter account
      const world: World = {
        id: worldId,
        name: `${username}'s Twitter`,
        agentId: runtime.agentId,
        serverId: twitterId,
        metadata: {
          ownership: { ownerId: twitterId },
          roles: {
            [twitterId]: Role.OWNER,
          },
          twitter: {
            username: username,
            id: twitterId,
          },
        },
      };

      // We'll create a "home timeline" room
      const homeTimelineRoomId = createUniqueUuid(
        runtime,
        `${twitterId}-home`,
      ) as UUID;
      const homeTimelineRoom: Room = {
        id: homeTimelineRoomId,
        name: `${username}'s Timeline`,
        source: "twitter",
        type: ChannelType.FEED,
        channelId: `${twitterId}-home`,
        serverId: twitterId,
        worldId: worldId,
      };

      // Create a "mentions" room
      const mentionsRoomId = createUniqueUuid(
        runtime,
        `${twitterId}-mentions`,
      ) as UUID;
      const mentionsRoom: Room = {
        id: mentionsRoomId,
        name: `${username}'s Mentions`,
        source: "twitter",
        type: ChannelType.GROUP,
        channelId: `${twitterId}-mentions`,
        serverId: twitterId,
        worldId: worldId,
      };

      // Create an entity for the Twitter user
      const twitterUserId = createUniqueUuid(runtime, twitterId) as UUID;
      const twitterUser: Entity = {
        id: twitterUserId,
        names: [profile.screenName || username],
        agentId: runtime.agentId,
        metadata: {
          twitter: {
            id: twitterId,
            username: username,
            screenName: profile.screenName || username,
            name: profile.screenName || username,
          },
        },
      };

      // Emit the WORLD_JOINED event
      runtime.emitEvent(
        [TwitterEventTypes.WORLD_JOINED, EventType.WORLD_JOINED],
        {
          runtime: runtime,
          world: world,
          rooms: [homeTimelineRoom, mentionsRoom],
          entities: [twitterUser],
          source: "twitter",
        },
      );

      logger.info(`Emitted WORLD_JOINED event for Twitter account ${username}`);
    } catch (error) {
      logger.error("Failed to emit WORLD_JOINED event for Twitter:", error);
    }
  }

  getClient(
    clientId: string,
    agentId: UUID,
  ): TwitterClientInstance | undefined {
    return this.clients.get(this.getClientKey(clientId, agentId));
  }

  async stopClient(clientId: string, agentId: UUID): Promise<void> {
    const key = this.getClientKey(clientId, agentId);
    const client = this.clients.get(key);
    if (client) {
      try {
        // Stop all client components
        if (client.post) {
          await client.post.stop();
        }
        if (client.interaction) {
          await client.interaction.stop();
        }
        if (client.timeline) {
          await client.timeline.stop();
        }
        
        this.clients.delete(key);
        logger.info(`Stopped Twitter client for ${clientId}`);
      } catch (error) {
        logger.error(`Error stopping Twitter client for ${clientId}:`, error);
      }
    }
  }

  static async start(runtime: IAgentRuntime) {
    const twitterClientManager = TwitterService.getInstance();

    // Check for character-level Twitter credentials
    const twitterConfig: Partial<TwitterConfig> = {
      TWITTER_API_KEY:
        String(runtime.getSetting("TWITTER_API_KEY") || "") ||
        String(runtime.character.settings?.TWITTER_API_KEY || "") ||
        String(runtime.character.secrets?.TWITTER_API_KEY || ""),
      TWITTER_API_SECRET_KEY:
        String(runtime.getSetting("TWITTER_API_SECRET_KEY") || "") ||
        String(runtime.character.settings?.TWITTER_API_SECRET_KEY || "") ||
        String(runtime.character.secrets?.TWITTER_API_SECRET_KEY || ""),
      TWITTER_ACCESS_TOKEN:
        String(runtime.getSetting("TWITTER_ACCESS_TOKEN") || "") ||
        String(runtime.character.settings?.TWITTER_ACCESS_TOKEN || "") ||
        String(runtime.character.secrets?.TWITTER_ACCESS_TOKEN || ""),
      TWITTER_ACCESS_TOKEN_SECRET:
        String(runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET") || "") ||
        String(runtime.character.settings?.TWITTER_ACCESS_TOKEN_SECRET || "") ||
        String(runtime.character.secrets?.TWITTER_ACCESS_TOKEN_SECRET || ""),
    };

    // Filter out undefined values
    const config = Object.fromEntries(
      Object.entries(twitterConfig).filter(([_, v]) => v !== undefined && v !== ""),
    ) as TwitterConfig;

    // If we have enough settings to create a client, do so
    try {
      if (
        config.TWITTER_API_KEY &&
        config.TWITTER_API_SECRET_KEY &&
        config.TWITTER_ACCESS_TOKEN &&
        config.TWITTER_ACCESS_TOKEN_SECRET
      ) {
        logger.info("Creating default Twitter client from character settings");
        await twitterClientManager.createClient(
          runtime,
          runtime.agentId,
          config,
        );
      }
    } catch (error) {
      logger.error("Failed to create default Twitter client:", error);
      throw error;
    }

    return twitterClientManager;
  }

  async stop(): Promise<void> {
    await this.stopAllClients();
  }

  async stopAllClients(): Promise<void> {
    for (const [key, client] of this.clients.entries()) {
      try {
        // Stop all client components
        if (client.post) {
          await client.post.stop();
        }
        if (client.interaction) {
          await client.interaction.stop();
        }
        if (client.timeline) {
          await client.timeline.stop();
        }
        
        this.clients.delete(key);
      } catch (error) {
        logger.error(`Error stopping Twitter client ${key}:`, error);
      }
    }
  }

  private getClientKey(clientId: string, agentId: UUID): string {
    return `${clientId}-${agentId}`;
  }
}

const twitterPlugin: Plugin = {
  name: TWITTER_SERVICE_NAME,
  description: "Twitter client with per-server instance management",
  services: [TwitterService],
  actions: [],
  tests: [new ClientBaseTestSuite()],
};

export default twitterPlugin;
