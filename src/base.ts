import {
  ChannelType,
  type Content,
  type IAgentRuntime,
  type Memory,
  type State,
  type UUID,
  createUniqueUuid,
  logger,
} from "@elizaos/core";
import {
  Client,
  type QueryTweetsResponse,
  SearchMode,
  type Tweet,
} from "./client/index";
import { TwitterInteractionPayload } from "./types";

interface TwitterUser {
  id_str: string;
  screen_name: string;
  name: string;
}

interface TwitterFollowersResponse {
  users: TwitterUser[];
}

/**
 * Extracts the answer from the given text.
 *
 * @param {string} text - The text containing the answer
 * @returns {string} The extracted answer
 */
export function extractAnswer(text: string): string {
  const startIndex = text.indexOf("Answer: ") + 8;
  const endIndex = text.indexOf("<|endoftext|>", 11);
  return text.slice(startIndex, endIndex);
}

/**
 * Represents a Twitter Profile.
 * @typedef {Object} TwitterProfile
 * @property {string} id - The unique identifier of the profile.
 * @property {string} username - The username of the profile.
 * @property {string} screenName - The screen name of the profile.
 * @property {string} bio - The biography of the profile.
 * @property {string[]} nicknames - An array of nicknames associated with the profile.
 */
type TwitterProfile = {
  id: string;
  username: string;
  screenName: string;
  bio: string;
  nicknames: string[];
};

/**
 * Class representing a request queue for handling asynchronous requests in a controlled manner.
 */

class RequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private processing = false;

  /**
   * Asynchronously adds a request to the queue, then processes the queue.
   *
   * @template T
   * @param {() => Promise<T>} request - The request to be added to the queue
   * @returns {Promise<T>} - A promise that resolves with the result of the request or rejects with an error
   */
  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  /**
   * Asynchronously processes the queue of requests.
   *
   * @returns A promise that resolves when the queue has been fully processed.
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      try {
        await request();
      } catch (error) {
        console.error("Error processing request:", error);
        this.queue.unshift(request);
        await this.exponentialBackoff(this.queue.length);
      }
      await this.randomDelay();
    }

    this.processing = false;
  }

  /**
   * Implements an exponential backoff strategy for retrying a task.
   * @param {number} retryCount - The number of retries attempted so far.
   * @returns {Promise<void>} - A promise that resolves after a delay based on the retry count.
   */
  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delay = 2 ** retryCount * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Asynchronous method that creates a random delay between 1500ms and 3500ms.
   *
   * @returns A Promise that resolves after the random delay has passed.
   */
  private async randomDelay(): Promise<void> {
    const delay = Math.floor(Math.random() * 2000) + 1500;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Class representing a base client for interacting with Twitter.
 * @extends EventEmitter
 */
export class ClientBase {
  static _twitterClients: { [accountIdentifier: string]: Client } = {};
  twitterClient: Client;
  runtime: IAgentRuntime;
  lastCheckedTweetId: bigint | null = null;
  temperature = 0.5;

  requestQueue: RequestQueue = new RequestQueue();

  profile: TwitterProfile | null;

  /**
   * Caches a tweet in the database.
   *
   * @param {Tweet} tweet - The tweet to cache.
   * @returns {Promise<void>} A promise that resolves once the tweet is cached.
   */
  async cacheTweet(tweet: Tweet): Promise<void> {
    if (!tweet) {
      console.warn("Tweet is undefined, skipping cache");
      return;
    }

    this.runtime.setCache<Tweet>(`twitter/tweets/${tweet.id}`, tweet);
  }

  /**
   * Retrieves a cached tweet by its ID.
   * @param {string} tweetId - The ID of the tweet to retrieve from the cache.
   * @returns {Promise<Tweet | undefined>} A Promise that resolves to the cached tweet, or undefined if the tweet is not found in the cache.
   */
  async getCachedTweet(tweetId: string): Promise<Tweet | undefined> {
    const cached = await this.runtime.getCache<Tweet>(
      `twitter/tweets/${tweetId}`,
    );

    if (!cached) {
      return undefined;
    }

    return cached;
  }

  /**
   * Asynchronously retrieves a tweet with the specified ID.
   * If the tweet is found in the cache, it is returned from the cache.
   * If not, a request is made to the Twitter API to get the tweet, which is then cached and returned.
   * @param {string} tweetId - The ID of the tweet to retrieve.
   * @returns {Promise<Tweet>} A Promise that resolves to the retrieved tweet.
   */
  async getTweet(tweetId: string): Promise<Tweet> {
    const cachedTweet = await this.getCachedTweet(tweetId);

    if (cachedTweet) {
      return cachedTweet;
    }

    const tweet = await this.requestQueue.add(() =>
      this.twitterClient.getTweet(tweetId),
    );

    await this.cacheTweet(tweet);
    return tweet;
  }

  callback: (self: ClientBase) => any = null;

  /**
   * This method is called when the application is ready.
   * It throws an error indicating that it is not implemented in the base class
   * and should be implemented in the subclass.
   */
  onReady() {
    throw new Error("Not implemented in base class, please call from subclass");
  }

  /**
   * Parse the raw tweet data into a standardized Tweet object.
   */
  /**
   * Parses a raw tweet object into a structured Tweet object.
   *
   * @param {any} raw - The raw tweet object to parse.
   * @param {number} [depth=0] - The current depth of parsing nested quotes/retweets.
   * @param {number} [maxDepth=3] - The maximum depth allowed for parsing nested quotes/retweets.
   * @returns {Tweet} The parsed Tweet object.
   */
  parseTweet(raw: any, depth = 0, maxDepth = 3): Tweet {
    // If we've reached maxDepth, don't parse nested quotes/retweets further
    const canRecurse = depth < maxDepth;

    const quotedStatus =
      raw.quoted_status_result?.result && canRecurse
        ? this.parseTweet(raw.quoted_status_result.result, depth + 1, maxDepth)
        : undefined;

    const retweetedStatus =
      raw.retweeted_status_result?.result && canRecurse
        ? this.parseTweet(
            raw.retweeted_status_result.result,
            depth + 1,
            maxDepth,
          )
        : undefined;

    const t: Tweet = {
      bookmarkCount:
        raw.bookmarkCount ?? raw.legacy?.bookmark_count ?? undefined,
      conversationId: raw.conversationId ?? raw.legacy?.conversation_id_str,
      hashtags: raw.hashtags ?? raw.legacy?.entities?.hashtags ?? [],
      html: raw.html,
      id: raw.id ?? raw.rest_id ?? raw.legacy.id_str ?? raw.id_str ?? undefined,
      inReplyToStatus: raw.inReplyToStatus,
      inReplyToStatusId:
        raw.inReplyToStatusId ??
        raw.legacy?.in_reply_to_status_id_str ??
        undefined,
      isQuoted: raw.legacy?.is_quote_status === true,
      isPin: raw.isPin,
      isReply: raw.isReply,
      isRetweet: raw.legacy?.retweeted === true,
      isSelfThread: raw.isSelfThread,
      language: raw.legacy?.lang,
      likes: raw.legacy?.favorite_count ?? 0,
      name:
        raw.name ??
        raw?.user_results?.result?.legacy?.name ??
        raw.core?.user_results?.result?.legacy?.name,
      mentions: raw.mentions ?? raw.legacy?.entities?.user_mentions ?? [],
      permanentUrl:
        raw.permanentUrl ??
        (raw.core?.user_results?.result?.legacy?.screen_name && raw.rest_id
          ? `https://x.com/${raw.core?.user_results?.result?.legacy?.screen_name}/status/${raw.rest_id}`
          : undefined),
      photos:
        raw.photos ??
        (raw.legacy?.entities?.media
          ?.filter((media: any) => media.type === "photo")
          .map((media: any) => ({
            id: media.id_str || media.rest_id || media.legacy.id_str,
            url: media.media_url_https,
            alt_text: media.alt_text,
          })) ||
          []),
      place: raw.place,
      poll: raw.poll ?? null,
      quotedStatus,
      quotedStatusId:
        raw.quotedStatusId ?? raw.legacy?.quoted_status_id_str ?? undefined,
      quotes: raw.legacy?.quote_count ?? 0,
      replies: raw.legacy?.reply_count ?? 0,
      retweets: raw.legacy?.retweet_count ?? 0,
      retweetedStatus,
      retweetedStatusId: raw.legacy?.retweeted_status_id_str ?? undefined,
      text: raw.text ?? raw.legacy?.full_text ?? undefined,
      thread: raw.thread || [],
      timeParsed: raw.timeParsed
        ? new Date(raw.timeParsed)
        : raw.legacy?.created_at
          ? new Date(raw.legacy?.created_at)
          : undefined,
      timestamp:
        raw.timestamp ??
        (raw.legacy?.created_at
          ? new Date(raw.legacy.created_at).getTime() / 1000
          : undefined),
      urls: raw.urls ?? raw.legacy?.entities?.urls ?? [],
      userId: raw.userId ?? raw.legacy?.user_id_str ?? undefined,
      username:
        raw.username ??
        raw.core?.user_results?.result?.legacy?.screen_name ??
        undefined,
      videos:
        raw.videos ??
        raw.legacy?.entities?.media?.filter(
          (media: any) => media.type === "video",
        ) ??
        [],
      views: raw.views?.count ? Number(raw.views.count) : 0,
      sensitiveContent: raw.sensitiveContent,
    };

    return t;
  }

  state: any;

  constructor(runtime: IAgentRuntime, state: any) {
    this.runtime = runtime;
    this.state = state;
    // Use API key as the identifier for client reuse
    const apiKey =
      state?.TWITTER_API_KEY ||
      (this.runtime.getSetting("TWITTER_API_KEY") as string);
    if (apiKey && ClientBase._twitterClients[apiKey]) {
      this.twitterClient = ClientBase._twitterClients[apiKey];
    } else {
      this.twitterClient = new Client();
      if (apiKey) {
        ClientBase._twitterClients[apiKey] = this.twitterClient;
      }
    }
  }

  async init() {
    // First ensure the agent exists in the database
    // await this.runtime.ensureAgentExists(this.runtime.character);

    const apiKey =
      this.state?.TWITTER_API_KEY || this.runtime.getSetting("TWITTER_API_KEY");
    const apiSecretKey =
      this.state?.TWITTER_API_SECRET_KEY ||
      this.runtime.getSetting("TWITTER_API_SECRET_KEY");
    const accessToken =
      this.state?.TWITTER_ACCESS_TOKEN ||
      this.runtime.getSetting("TWITTER_ACCESS_TOKEN");
    const accessTokenSecret =
      this.state?.TWITTER_ACCESS_TOKEN_SECRET ||
      this.runtime.getSetting("TWITTER_ACCESS_TOKEN_SECRET");

    // Validate required credentials
    if (!apiKey || !apiSecretKey || !accessToken || !accessTokenSecret) {
      const missing = [];
      if (!apiKey) missing.push("TWITTER_API_KEY");
      if (!apiSecretKey) missing.push("TWITTER_API_SECRET_KEY");
      if (!accessToken) missing.push("TWITTER_ACCESS_TOKEN");
      if (!accessTokenSecret) missing.push("TWITTER_ACCESS_TOKEN_SECRET");
      throw new Error(
        `Missing required Twitter API credentials: ${missing.join(", ")}`,
      );
    }

    const maxRetries = process.env.MAX_RETRIES
      ? parseInt(process.env.MAX_RETRIES)
      : 3;
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
      try {
        logger.log("Initializing Twitter API v2 client");
        await this.twitterClient.login(
          "", // username not needed for API v2
          "", // password not needed for API v2
          "", // email not needed for API v2
          "", // 2FA not needed for API v2
          apiKey,
          apiSecretKey,
          accessToken,
          accessTokenSecret,
        );

        if (await this.twitterClient.isLoggedIn()) {
          logger.info("Successfully authenticated with Twitter API v2");
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `Authentication attempt ${retryCount + 1} failed: ${lastError.message}`,
        );
        retryCount++;

        if (retryCount < maxRetries) {
          const delay = 2 ** retryCount * 1000; // Exponential backoff
          logger.info(`Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (retryCount >= maxRetries) {
      throw new Error(
        `Twitter authentication failed after ${maxRetries} attempts. Last error: ${lastError?.message}`,
      );
    }

    // Initialize Twitter profile from the authenticated user
    const profile = await this.twitterClient.me();
    if (profile) {
      logger.log("Twitter user ID:", profile.userId);
      logger.log("Twitter loaded:", JSON.stringify(profile, null, 10));

      const agentId = this.runtime.agentId;

      const entity = await this.runtime.getEntityById(agentId);
      const entityMetadata = entity?.metadata as any;
      if (entityMetadata?.twitter?.userName !== profile.username) {
        logger.log(
          "Updating Agents known X/twitter handle",
          profile.username,
          "was",
          entityMetadata?.twitter,
        );
        const names = [profile.name, profile.username];
        await this.runtime.updateEntity({
          id: agentId,
          names: [...new Set([...(entity.names || []), ...names])].filter(
            Boolean,
          ),
          metadata: {
            ...(entityMetadata || {}),
            twitter: {
              ...(entityMetadata?.twitter || {}),
              name: profile.name,
              userName: profile.username,
            },
          },
          agentId,
        });
      }

      // Store profile info for use in responses
      this.profile = {
        id: profile.userId,
        username: profile.username, // this is the at
        screenName: profile.name, // this is the human readable name
        bio: profile.biography || "",
        nicknames: [],
      };
    } else {
      throw new Error("Failed to load profile");
    }

    await this.loadLatestCheckedTweetId();
    await this.populateTimeline();
  }

  async fetchOwnPosts(count: number): Promise<Tweet[]> {
    logger.debug("fetching own posts");
    const homeTimeline = await this.twitterClient.getUserTweets(
      this.profile.id,
      count,
    );
    // Use parseTweet on each tweet
    return homeTimeline.tweets.map((t) => this.parseTweet(t));
  }

  /**
   * Fetch timeline for twitter account, optionally only from followed accounts
   */
  async fetchHomeTimeline(
    count: number,
    following?: boolean,
  ): Promise<Tweet[]> {
    logger.debug("fetching home timeline");
    const homeTimeline = following
      ? await this.twitterClient.fetchFollowingTimeline(count, [])
      : await this.twitterClient.fetchHomeTimeline(count, []);

    const processedTimeline = homeTimeline
      .filter((t) => t.__typename !== "TweetWithVisibilityResults") // what's this about?
      .map((tweet) => this.parseTweet(tweet));

    //logger.debug("process homeTimeline", processedTimeline);
    return processedTimeline;
  }

  async fetchSearchTweets(
    query: string,
    maxTweets: number,
    searchMode: SearchMode,
    cursor?: string,
  ): Promise<QueryTweetsResponse> {
    try {
      // Sometimes this fails because we are rate limited. in this case, we just need to return an empty array
      // if we dont get a response in 5 seconds, something is wrong
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ tweets: [] }), 15000),
      );

      try {
        const result = await this.requestQueue.add(
          async () =>
            await Promise.race([
              this.twitterClient.fetchSearchTweets(
                query,
                maxTweets,
                searchMode,
                cursor,
              ),
              timeoutPromise,
            ]),
        );
        return (result ?? { tweets: [] }) as QueryTweetsResponse;
      } catch (error) {
        logger.error("Error fetching search tweets:", error);
        return { tweets: [] };
      }
    } catch (error) {
      logger.error("Error fetching search tweets:", error);
      return { tweets: [] };
    }
  }

  private async populateTimeline() {
    logger.debug("populating timeline...");

    const cachedTimeline = await this.getCachedTimeline();

    // Check if the cache file exists
    if (cachedTimeline) {
      // Read the cached search results from the file

      // Get the existing memories from the database
      const existingMemories = await this.runtime.getMemoriesByRoomIds({
        tableName: "messages",
        roomIds: cachedTimeline.map((tweet) =>
          createUniqueUuid(this.runtime, tweet.conversationId),
        ),
      });

      //TODO: load tweets not in cache?

      // Create a Set to store the IDs of existing memories
      const existingMemoryIds = new Set(
        existingMemories.map((memory) => memory.id.toString()),
      );

      // Check if any of the cached tweets exist in the existing memories
      const someCachedTweetsExist = cachedTimeline.some((tweet) =>
        existingMemoryIds.has(createUniqueUuid(this.runtime, tweet.id)),
      );

      if (someCachedTweetsExist) {
        // Filter out the cached tweets that already exist in the database
        const tweetsToSave = cachedTimeline.filter(
          (tweet) =>
            tweet.userId !== this.profile.id &&
            !existingMemoryIds.has(createUniqueUuid(this.runtime, tweet.id)),
        );

        // Save the missing tweets as memories
        for (const tweet of tweetsToSave) {
          logger.log("Saving Tweet", tweet.id);

          if (tweet.userId === this.profile.id) {
            continue;
          }

          // Create a world for this Twitter user if it doesn't exist
          const worldId = createUniqueUuid(this.runtime, tweet.userId) as UUID;
          await this.runtime.ensureWorldExists({
            id: worldId,
            name: `${tweet.username}'s Twitter`,
            agentId: this.runtime.agentId,
            serverId: tweet.userId,
            metadata: {
              ownership: { ownerId: tweet.userId },
              twitter: {
                username: tweet.username,
                id: tweet.userId,
              },
            },
          });

          const roomId = createUniqueUuid(this.runtime, tweet.conversationId);
          const entityId =
            tweet.userId === this.profile.id
              ? this.runtime.agentId
              : createUniqueUuid(this.runtime, tweet.userId);

          // Ensure the entity exists with proper world association
          await this.runtime.ensureConnection({
            entityId,
            roomId,
            userName: tweet.username,
            name: tweet.name,
            source: "twitter",
            type: ChannelType.FEED,
            worldId: worldId,
          });

          const content = {
            text: tweet.text,
            url: tweet.permanentUrl,
            source: "twitter",
            inReplyTo: tweet.inReplyToStatusId
              ? createUniqueUuid(this.runtime, tweet.inReplyToStatusId)
              : undefined,
          } as Content;

          await this.runtime.createMemory(
            {
              id: createUniqueUuid(this.runtime, tweet.id),
              entityId,
              content: content,
              agentId: this.runtime.agentId,
              roomId,
              createdAt: tweet.timestamp * 1000,
            },
            "messages",
          );

          await this.cacheTweet(tweet);
        }

        logger.log(
          `Populated ${tweetsToSave.length} missing tweets from the cache.`,
        );
        return;
      }
    }

    const timeline = await this.fetchHomeTimeline(cachedTimeline ? 10 : 50);

    // Get the most recent 20 mentions and interactions
    const mentionsAndInteractions = await this.fetchSearchTweets(
      `@${this.profile.username}`,
      20,
      SearchMode.Latest,
    );

    // Combine the timeline tweets and mentions/interactions
    const allTweets = [...timeline, ...mentionsAndInteractions.tweets];

    // Create a Set to store unique tweet IDs
    const tweetIdsToCheck = new Set<string>();
    const roomIds = new Set<UUID>();

    // Add tweet IDs to the Set
    for (const tweet of allTweets) {
      tweetIdsToCheck.add(tweet.id);
      roomIds.add(createUniqueUuid(this.runtime, tweet.conversationId));
    }

    // Check the existing memories in the database
    const existingMemories = await this.runtime.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: Array.from(roomIds),
    });

    // Create a Set to store the existing memory IDs
    const existingMemoryIds = new Set<UUID>(
      existingMemories.map((memory) => memory.id),
    );

    // Filter out the tweets that already exist in the database
    const tweetsToSave = allTweets.filter(
      (tweet) =>
        tweet.userId !== this.profile.id &&
        !existingMemoryIds.has(createUniqueUuid(this.runtime, tweet.id)),
    );

    logger.debug({
      processingTweets: tweetsToSave.map((tweet) => tweet.id).join(","),
    });

    // Save the new tweets as memories
    for (const tweet of tweetsToSave) {
      logger.log("Saving Tweet", tweet.id);

      if (tweet.userId === this.profile.id) {
        continue;
      }

      // Create a world for this Twitter user if it doesn't exist
      const worldId = createUniqueUuid(this.runtime, tweet.userId) as UUID;
      await this.runtime.ensureWorldExists({
        id: worldId,
        name: `${tweet.username}'s Twitter`,
        agentId: this.runtime.agentId,
        serverId: tweet.userId,
        metadata: {
          ownership: { ownerId: tweet.userId },
          twitter: {
            username: tweet.username,
            id: tweet.userId,
          },
        },
      });

      const roomId = createUniqueUuid(this.runtime, tweet.conversationId);

      const entityId =
        tweet.userId === this.profile.id
          ? this.runtime.agentId
          : createUniqueUuid(this.runtime, tweet.userId);

      // Ensure the entity exists with proper world association
      await this.runtime.ensureConnection({
        entityId,
        roomId,
        userName: tweet.username,
        name: tweet.name,
        source: "twitter",
        type: ChannelType.FEED,
        worldId: worldId,
      });

      const content = {
        text: tweet.text,
        url: tweet.permanentUrl,
        source: "twitter",
        inReplyTo: tweet.inReplyToStatusId
          ? createUniqueUuid(this.runtime, tweet.inReplyToStatusId)
          : undefined,
      } as Content;

      await this.runtime.createMemory(
        {
          id: createUniqueUuid(this.runtime, tweet.id),
          entityId,
          content: content,
          agentId: this.runtime.agentId,
          roomId,
          createdAt: tweet.timestamp * 1000,
        },
        "messages",
      );

      await this.cacheTweet(tweet);
    }

    // Cache
    await this.cacheTimeline(timeline);
    await this.cacheMentions(mentionsAndInteractions.tweets);
  }

  async saveRequestMessage(message: Memory, state: State) {
    if (message.content.text) {
      const recentMessage = await this.runtime.getMemories({
        tableName: "messages",
        roomId: message.roomId,
        count: 1,
        unique: false,
      });

      if (
        recentMessage.length > 0 &&
        recentMessage[0].content === message.content
      ) {
        logger.debug("Message already saved", recentMessage[0].id);
      } else {
        await this.runtime.createMemory(message, "messages");
      }

      await this.runtime.evaluate(message, {
        ...state,
        twitterClient: this.twitterClient,
      });
    }
  }

  async loadLatestCheckedTweetId(): Promise<void> {
    const latestCheckedTweetId = await this.runtime.getCache<string>(
      `twitter/${this.profile.username}/latest_checked_tweet_id`,
    );

    if (latestCheckedTweetId) {
      this.lastCheckedTweetId = BigInt(latestCheckedTweetId);
    }
  }

  async cacheLatestCheckedTweetId() {
    if (this.lastCheckedTweetId) {
      await this.runtime.setCache<string>(
        `twitter/${this.profile.username}/latest_checked_tweet_id`,
        this.lastCheckedTweetId.toString(),
      );
    }
  }

  async getCachedTimeline(): Promise<Tweet[] | undefined> {
    const cached = await this.runtime.getCache<Tweet[]>(
      `twitter/${this.profile.username}/timeline`,
    );

    if (!cached) {
      return undefined;
    }

    return cached;
  }

  async cacheTimeline(timeline: Tweet[]) {
    await this.runtime.setCache<Tweet[]>(
      `twitter/${this.profile.username}/timeline`,
      timeline,
    );
  }

  async cacheMentions(mentions: Tweet[]) {
    await this.runtime.setCache<Tweet[]>(
      `twitter/${this.profile.username}/mentions`,
      mentions,
    );
  }

  async fetchProfile(username: string): Promise<TwitterProfile> {
    try {
      const profile = await this.requestQueue.add(async () => {
        const profile = await this.twitterClient.getProfile(username);
        return {
          id: profile.userId,
          username,
          screenName: profile.name || this.runtime.character.name,
          bio:
            profile.biography || typeof this.runtime.character.bio === "string"
              ? (this.runtime.character.bio as string)
              : this.runtime.character.bio.length > 0
                ? this.runtime.character.bio[0]
                : "",
          nicknames: this.profile?.nicknames || [],
        } satisfies TwitterProfile;
      });

      return profile;
    } catch (error) {
      console.error("Error fetching Twitter profile:", error);
      throw error;
    }
  }

  /**
   * Fetches recent interactions (likes, retweets, quotes) for the authenticated user's tweets
   */
  async fetchInteractions() {
    try {
      const username = this.profile.username;
      // Use fetchSearchTweets to get mentions instead of the non-existent get method
      const mentionsResponse = await this.requestQueue.add(() =>
        this.twitterClient.fetchSearchTweets(
          `@${username}`,
          100,
          SearchMode.Latest,
        ),
      );

      // Process tweets directly into the expected interaction format
      return mentionsResponse.tweets.map((tweet) =>
        this.formatTweetToInteraction(tweet),
      );
    } catch (error) {
      logger.error("Error fetching Twitter interactions:", error);
      return [];
    }
  }

  formatTweetToInteraction(tweet): TwitterInteractionPayload | null {
    if (!tweet) return null;

    const isQuote = tweet.isQuoted;
    const isRetweet = !!tweet.retweetedStatus;
    const type = isQuote ? "quote" : isRetweet ? "retweet" : "like";

    return {
      id: tweet.id,
      type,
      userId: tweet.userId,
      username: tweet.username,
      name: tweet.name || tweet.username,
      targetTweetId: tweet.inReplyToStatusId || tweet.quotedStatusId,
      targetTweet: tweet.quotedStatus || tweet,
      quoteTweet: isQuote ? tweet : undefined,
      retweetId: tweet.retweetedStatus?.id,
    };
  }
}
