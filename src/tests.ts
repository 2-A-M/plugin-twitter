// packages/plugin-twitter/src/tests/ClientBaseTestSuite.ts

import type { TestSuite } from "@elizaos/core";
import type { IAgentRuntime } from "@elizaos/core";
import type { TwitterConfig } from "./environment";
import { ClientBase } from "./base";

/**
 * Test suite for Twitter client base functionality
 */
export class ClientBaseTestSuite implements TestSuite {
  name = "twitter-client-base";

  private mockRuntime: IAgentRuntime;
  private mockConfig: TwitterConfig;

  constructor() {
    // Create a mock runtime for tests
    this.mockRuntime = {
      agentId: "test-agent-id" as any,
      getSetting: (key: string) => {
        return this.mockConfig[key];
      },
      character: {},
      getCache: async () => null,
      setCache: async () => {},
      getMemoriesByRoomIds: async () => [],
      ensureWorldExists: async () => {},
      ensureConnection: async () => {},
      createMemory: async () => {},
      getEntityById: async () => null,
      updateEntity: async () => {},
    } as any;

    // Create test config with only API v2 credentials
    this.mockConfig = {
      TWITTER_API_KEY: "test-api-key",
      TWITTER_API_SECRET_KEY: "test-api-secret",
      TWITTER_ACCESS_TOKEN: "test-access-token",
      TWITTER_ACCESS_TOKEN_SECRET: "test-access-secret",
      TWITTER_TARGET_USERS: "",
      TWITTER_RETRY_LIMIT: "5",
      TWITTER_POLL_INTERVAL: "120",
      TWITTER_SEARCH_ENABLE: "true",
      TWITTER_DRY_RUN: "false",
      TWITTER_POST_ENABLE: "false",
      TWITTER_POST_INTERVAL_MIN: "90",
      TWITTER_POST_INTERVAL_MAX: "180",
      TWITTER_POST_IMMEDIATELY: "false",
      TWITTER_INTERACTION_INTERVAL_MIN: "15",
      TWITTER_INTERACTION_INTERVAL_MAX: "30",
      TWITTER_TIMELINE_ALGORITHM: "weighted",
      TWITTER_TIMELINE_USER_BASED_WEIGHT: "3",
      TWITTER_TIMELINE_TIME_BASED_WEIGHT: "2",
      TWITTER_TIMELINE_RELEVANCE_WEIGHT: "5",
      TWITTER_MAX_TWEET_LENGTH: "4000",
      TWITTER_MAX_INTERACTIONS_PER_RUN: "10",
      TWITTER_DM_ONLY: "false",
      TWITTER_ENABLE_ACTION_PROCESSING: "false",
      TWITTER_ACTION_INTERVAL: "240",
      TWITTER_AUTO_RESPOND_MENTIONS: "true",
      TWITTER_AUTO_RESPOND_REPLIES: "true",
      TWITTER_POST_INTERVAL_VARIANCE: "0.2",
      TWITTER_INTERACTION_INTERVAL_VARIANCE: "0.3",
    };
  }

  tests = [
    {
      name: "Create instance with correct configuration",
      fn: async () => {
        const state = {
          TWITTER_API_KEY: this.mockConfig.TWITTER_API_KEY,
          TWITTER_API_SECRET_KEY: this.mockConfig.TWITTER_API_SECRET_KEY,
          TWITTER_ACCESS_TOKEN: this.mockConfig.TWITTER_ACCESS_TOKEN,
          TWITTER_ACCESS_TOKEN_SECRET:
            this.mockConfig.TWITTER_ACCESS_TOKEN_SECRET,
        };
        const client = new ClientBase(this.mockRuntime, state);

        // Verify API credentials are passed to state
        if (client.state.TWITTER_API_KEY !== this.mockConfig.TWITTER_API_KEY) {
          throw new Error("Client state TWITTER_API_KEY mismatch.");
        }
        if (
          client.state.TWITTER_API_SECRET_KEY !==
          this.mockConfig.TWITTER_API_SECRET_KEY
        ) {
          throw new Error("Client state TWITTER_API_SECRET_KEY mismatch.");
        }
        if (
          client.state.TWITTER_ACCESS_TOKEN !==
          this.mockConfig.TWITTER_ACCESS_TOKEN
        ) {
          throw new Error("Client state TWITTER_ACCESS_TOKEN mismatch.");
        }
        if (
          client.state.TWITTER_ACCESS_TOKEN_SECRET !==
          this.mockConfig.TWITTER_ACCESS_TOKEN_SECRET
        ) {
          throw new Error("Client state TWITTER_ACCESS_TOKEN_SECRET mismatch.");
        }
      },
    },
    {
      name: "Initialize with correct post intervals",
      fn: async () => {
        const state = {
          TWITTER_API_KEY: this.mockConfig.TWITTER_API_KEY,
          TWITTER_API_SECRET_KEY: this.mockConfig.TWITTER_API_SECRET_KEY,
          TWITTER_ACCESS_TOKEN: this.mockConfig.TWITTER_ACCESS_TOKEN,
          TWITTER_ACCESS_TOKEN_SECRET:
            this.mockConfig.TWITTER_ACCESS_TOKEN_SECRET,
          TWITTER_POST_INTERVAL_MIN: this.mockConfig.TWITTER_POST_INTERVAL_MIN,
          TWITTER_POST_INTERVAL_MAX: this.mockConfig.TWITTER_POST_INTERVAL_MAX,
        };
        const client = new ClientBase(this.mockRuntime, state);

        // Verify post intervals are set correctly
        if (client.state.TWITTER_POST_INTERVAL_MIN !== "90") {
          throw new Error("Client state TWITTER_POST_INTERVAL_MIN mismatch.");
        }
        if (client.state.TWITTER_POST_INTERVAL_MAX !== "180") {
          throw new Error("Client state TWITTER_POST_INTERVAL_MAX mismatch.");
        }
      },
    },
  ];
}
