import type { ClientBase } from "./base";
import {
  ChannelType,
  composePromptFromState,
  createUniqueUuid,
  ModelType,
  type IAgentRuntime,
  UUID,
  State,
  Memory,
  parseKeyValueXml,
} from "@elizaos/core";
import type { Client, Tweet } from "./client/index";
import { logger } from "@elizaos/core";

import {
  twitterActionTemplate,
  quoteTweetTemplate,
  replyTweetTemplate,
} from "./templates";
import { sendTweet, parseActionResponseFromText } from "./utils";
import { ActionResponse } from "./types";

enum TIMELINE_TYPE {
  ForYou = "foryou",
  Following = "following",
}

export class TwitterTimelineClient {
  client: ClientBase;
  twitterClient: Client;
  runtime: IAgentRuntime;
  isDryRun: boolean;
  timelineType: TIMELINE_TYPE;
  private state: any;
  private isRunning: boolean = false;

  constructor(client: ClientBase, runtime: IAgentRuntime, state: any) {
    this.client = client;
    this.twitterClient = client.twitterClient;
    this.runtime = runtime;
    this.state = state;

    const dryRunSetting = this.state?.TWITTER_DRY_RUN ?? this.runtime.getSetting("TWITTER_DRY_RUN");
    this.isDryRun = dryRunSetting === true || dryRunSetting === "true" || 
                    (typeof dryRunSetting === "string" && dryRunSetting.toLowerCase() === "true");

    const timelineMode = 
      this.state?.TWITTER_TIMELINE_MODE ||
      this.runtime.getSetting("TWITTER_TIMELINE_MODE") ||
      "foryou";
    
    // Convert string to enum value
    this.timelineType = timelineMode.toLowerCase() === "following" 
      ? TIMELINE_TYPE.Following 
      : TIMELINE_TYPE.ForYou;
  }

  async start() {
    logger.info("Starting Twitter timeline client...");
    this.isRunning = true;
    
    const handleTwitterTimelineLoop = () => {
      if (!this.isRunning) {
        logger.info("Twitter timeline client stopped, exiting loop");
        return;
      }
      
      // Defaults to 240 minutes as per README
      const actionIntervalMinutes =
        this.state?.TWITTER_ACTION_INTERVAL ||
        (this.runtime.getSetting("TWITTER_ACTION_INTERVAL") as unknown as number) ||
        240;
      const actionInterval = actionIntervalMinutes * 60 * 1000; // Convert minutes to milliseconds
      
      logger.info(`Timeline client will check every ${actionIntervalMinutes} minutes`);

      this.handleTimeline();
      
      if (this.isRunning) {
        setTimeout(handleTwitterTimelineLoop, actionInterval);
      }
    };
    handleTwitterTimelineLoop();
  }

  async getTimeline(count: number): Promise<Tweet[]> {
    const twitterUsername = this.client.profile?.username;
    const homeTimeline =
      this.timelineType === TIMELINE_TYPE.Following
        ? await this.twitterClient.fetchFollowingTimeline(count, [])
        : await this.twitterClient.fetchHomeTimeline(count, []);

    // The timeline methods now return Tweet objects directly from v2 API
    return homeTimeline
      .filter((tweet) => tweet.username !== twitterUsername); // do not perform action on self-tweets
  }

  createTweetId(runtime: IAgentRuntime, tweet: Tweet) {
    return createUniqueUuid(runtime, tweet.id);
  }

  formMessage(runtime: IAgentRuntime, tweet: Tweet) {
    return {
      id: this.createTweetId(runtime, tweet),
      agentId: runtime.agentId,
      content: {
        text: tweet.text,
        url: tweet.permanentUrl,
        imageUrls: tweet.photos?.map((photo) => photo.url) || [],
        inReplyTo: tweet.inReplyToStatusId
          ? createUniqueUuid(runtime, tweet.inReplyToStatusId)
          : undefined,
        source: "twitter",
        channelType: ChannelType.GROUP,
        tweet,
      },
      entityId: createUniqueUuid(runtime, tweet.userId),
      roomId: createUniqueUuid(runtime, tweet.conversationId),
      createdAt: tweet.timestamp * 1000,
    };
  }

  async handleTimeline() {
    logger.info("Starting Twitter timeline processing...");

    const tweets = await this.getTimeline(20);
    logger.info(`Fetched ${tweets.length} tweets from timeline`);
    const maxActionsPerCycle = 20;
    const tweetDecisions = [];
    for (const tweet of tweets) {
      try {
        const tweetId = this.createTweetId(this.runtime, tweet);
        // Skip if we've already processed this tweet
        const memory = await this.runtime.getMemoryById(tweetId);
        if (memory) {
          logger.log(`Already processed tweet ID: ${tweet.id}`);
          continue;
        }

        const roomId = createUniqueUuid(this.runtime, tweet.conversationId);

        const message = this.formMessage(this.runtime, tweet);

        let state = await this.runtime.composeState(message);

        const actionRespondPrompt =
          composePromptFromState({
            state,
            template:
              this.runtime.character.templates?.twitterActionTemplate ||
              twitterActionTemplate,
          }) +
          `
Tweet:
${tweet.text}

# Respond with qualifying action tags only.

Choose any combination of [LIKE], [RETWEET], [QUOTE], and [REPLY] that are appropriate. Each action must be on its own line. Your response must only include the chosen actions.`;

        const actionResponse = await this.runtime.useModel(
          ModelType.TEXT_SMALL,
          {
            prompt: actionRespondPrompt,
          },
        );

        if (!actionResponse) {
          logger.log(`No valid actions generated for tweet ${tweet.id}`);
          continue;
        }

        const { actions } = parseActionResponseFromText(actionResponse.trim());

        tweetDecisions.push({
          tweet: tweet,
          actionResponse: actions,
          tweetState: state,
          roomId: roomId,
        });
      } catch (error) {
        logger.error(`Error processing tweet ${tweet.id}:`, error);
        continue;
      }
    }
    const rankByActionRelevance = (arr) => {
      return arr.sort((a, b) => {
        // Count the number of true values in the actionResponse object
        const countTrue = (obj: typeof a.actionResponse) =>
          Object.values(obj).filter(Boolean).length;

        const countA = countTrue(a.actionResponse);
        const countB = countTrue(b.actionResponse);

        // Primary sort by number of true values
        if (countA !== countB) {
          return countB - countA;
        }

        // Secondary sort by the "like" property
        if (a.actionResponse.like !== b.actionResponse.like) {
          return a.actionResponse.like ? -1 : 1;
        }

        // Tertiary sort keeps the remaining objects with equal weight
        return 0;
      });
    };
    // Sort the timeline based on the action decision score,
    const prioritizedTweets = rankByActionRelevance(tweetDecisions);
    
    logger.info(`Processing ${prioritizedTweets.length} tweets with actions`);
    if (prioritizedTweets.length > 0) {
      const actionSummary = prioritizedTweets.map(td => {
        const actions = [];
        if (td.actionResponse.like) actions.push('LIKE');
        if (td.actionResponse.retweet) actions.push('RETWEET');
        if (td.actionResponse.quote) actions.push('QUOTE');
        if (td.actionResponse.reply) actions.push('REPLY');
        return `Tweet ${td.tweet.id}: ${actions.join(', ')}`;
      });
      logger.info(`Actions to execute:\n${actionSummary.join('\n')}`);
    }

    await this.processTimelineActions(prioritizedTweets);
    logger.info("Timeline processing complete");
  }

  private async processTimelineActions(
    tweetDecisions: {
      tweet: Tweet;
      actionResponse: ActionResponse;
      tweetState: State;
      roomId: UUID;
    }[],
  ): Promise<
    {
      tweetId: string;
      actionResponse: ActionResponse;
      executedActions: string[];
    }[]
  > {
    const results = [];
    for (const decision of tweetDecisions) {
      const { actionResponse, tweetState, roomId, tweet } = decision;
      const entityId = createUniqueUuid(this.runtime, tweet.userId);
      const worldId = createUniqueUuid(this.runtime, tweet.userId);

      await this.ensureTweetWorldContext(tweet, roomId, worldId, entityId);

      try {
        const message = this.formMessage(this.runtime, tweet);

        await Promise.all([
          this.runtime.addEmbeddingToMemory(message),
          this.runtime.createMemory(message, "messages"),
        ]);

        // Execute actions
        if (actionResponse.like) {
          this.handleLikeAction(tweet);
        }

        if (actionResponse.retweet) {
          this.handleRetweetAction(tweet);
        }

        if (actionResponse.quote) {
          this.handleQuoteAction(tweet);
        }

        if (actionResponse.reply) {
          this.handleReplyAction(tweet);
        }
      } catch (error) {
        logger.error(`Error processing tweet ${tweet.id}:`, error);
        continue;
      }
    }

    return results;
  }

  private async ensureTweetWorldContext(
    tweet: Tweet,
    roomId: UUID,
    worldId: UUID,
    entityId: UUID,
  ) {
    await this.runtime.ensureConnection({
      entityId,
      roomId,
      userName: tweet.username,
      name: tweet.name,
      worldName: `${tweet.name}'s Twitter`,
      source: "twitter",
      type: ChannelType.GROUP,
      channelId: tweet.conversationId,
      serverId: tweet.userId,
      worldId,
      metadata: {
        ownership: { ownerId: tweet.userId },
        twitter: {
          username: tweet.username,
          id: tweet.userId,
          name: tweet.name,
        },
      },
    });
  }

  async handleLikeAction(tweet: Tweet) {
    try {
      if (this.isDryRun) {
        logger.log(`[DRY RUN] Would have liked tweet ${tweet.id}`);
        return;
      }
      await this.twitterClient.likeTweet(tweet.id);
      logger.log(`Liked tweet ${tweet.id}`);
    } catch (error) {
      logger.error(`Error liking tweet ${tweet.id}:`, error);
    }
  }

  async handleRetweetAction(tweet: Tweet) {
    try {
      if (this.isDryRun) {
        logger.log(`[DRY RUN] Would have retweeted tweet ${tweet.id}`);
        return;
      }
      await this.twitterClient.retweet(tweet.id);
      logger.log(`Retweeted tweet ${tweet.id}`);
    } catch (error) {
      logger.error(`Error retweeting tweet ${tweet.id}:`, error);
    }
  }

  async handleQuoteAction(tweet: Tweet) {
    try {
      const message = this.formMessage(this.runtime, tweet);

      let state = await this.runtime.composeState(message);

      const quotePrompt =
        composePromptFromState({
          state,
          template:
            this.runtime.character.templates?.quoteTweetTemplate ||
            quoteTweetTemplate,
        }) +
        `
You are responding to this tweet:
${tweet.text}`;

      const quoteResponse = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: quotePrompt,
      });
      const responseObject = parseKeyValueXml(quoteResponse);

      if (responseObject.post) {
        if (this.isDryRun) {
          logger.log(`[DRY RUN] Would have quoted tweet ${tweet.id} with: ${responseObject.post}`);
          return;
        }
        
        const result = await this.client.requestQueue.add(
          async () =>
            await this.twitterClient.sendQuoteTweet(
              responseObject.post,
              tweet.id,
            ),
        );

        const body: any = await result.json();

        const tweetResult =
          body?.data?.create_tweet?.tweet_results?.result || body?.data || body;
        if (tweetResult) {
          logger.log("Successfully posted quote tweet");
        } else {
          logger.error("Quote tweet creation failed:", body);
        }

        // Create memory for our response
        const tweetId =
          tweetResult?.id || Date.now().toString();
        const responseId = createUniqueUuid(this.runtime, tweetId);
        const responseMemory: Memory = {
          id: responseId,
          entityId: this.runtime.agentId,
          agentId: this.runtime.agentId,
          roomId: message.roomId,
          content: {
            ...responseObject,
            inReplyTo: message.id,
          },
          createdAt: Date.now(),
        };

        // Save the response to memory
        await this.runtime.createMemory(responseMemory, "messages");
      }
    } catch (error) {
      logger.error("Error in quote tweet generation:", error);
    }
  }

  async handleReplyAction(tweet: Tweet) {
    try {
      const message = this.formMessage(this.runtime, tweet);

      let state = await this.runtime.composeState(message);

      const replyPrompt =
        composePromptFromState({
          state,
          template:
            this.runtime.character.templates?.replyTweetTemplate ||
            replyTweetTemplate,
        }) +
        `
You are responding to this tweet:
${tweet.text}`;

      const replyResponse = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: replyPrompt,
      });
      const responseObject = parseKeyValueXml(replyResponse);

      if (responseObject.post) {
        if (this.isDryRun) {
          logger.log(`[DRY RUN] Would have replied to tweet ${tweet.id} with: ${responseObject.post}`);
          return;
        }
        
        const tweetResult = await sendTweet(
          this.client,
          responseObject.post,
          [],
          tweet.id,
        );

        if (!tweetResult) {
          throw new Error("Failed to get tweet result from response");
        }

        // Create memory for our response
        const responseId = createUniqueUuid(this.runtime, tweetResult.id);
        const responseMemory: Memory = {
          id: responseId,
          entityId: this.runtime.agentId,
          agentId: this.runtime.agentId,
          roomId: message.roomId,
          content: {
            ...responseObject,
            inReplyTo: message.id,
          },
          createdAt: Date.now(),
        };

        // Save the response to memory
        await this.runtime.createMemory(responseMemory, "messages");
      }
    } catch (error) {
      logger.error("Error in quote tweet generation:", error);
    }
  }
  
  async stop() {
    logger.info("Stopping Twitter timeline client...");
    this.isRunning = false;
  }
}
