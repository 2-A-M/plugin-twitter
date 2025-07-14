import {
  Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  logger,
  createUniqueUuid,
  ModelType,
} from "@elizaos/core";
import { ClientBase } from "../base.js";

export const postTweetAction: Action = {
  name: "POST_TWEET",
  similes: [
    "TWEET",
    "SEND_TWEET",
    "TWITTER_POST",
    "POST_ON_TWITTER",
    "SHARE_ON_TWITTER",
  ],
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    logger.debug("Validating POST_TWEET action");

    // Basic validation - make sure we have content to tweet
    const text = message.content?.text?.trim();
    if (!text || text.length === 0) {
      logger.error("No text content for tweet");
      return false;
    }

    // Check tweet length (280 characters)
    if (text.length > 280) {
      logger.warn(`Tweet too long: ${text.length} characters`);
      // Still valid, will be truncated or sent as thread
    }

    return true;
  },
  description: "Post a tweet on Twitter",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: { [key: string]: unknown },
    callback?: HandlerCallback,
  ): Promise<boolean> => {
    logger.info("Executing POST_TWEET action");

    try {
      // Initialize a Twitter client directly
      const client = new ClientBase(runtime, {});

      // Check if client is initialized
      if (!client.twitterClient) {
        await client.init();
      }

      // Verify we have a profile
      if (!client.profile) {
        throw new Error(
          "Twitter client not properly initialized - no profile found",
        );
      }

      // Get tweet content
      const tweetText = message.content?.text?.trim() || "";

      // Generate a more natural tweet if the input is too short or generic
      let finalTweetText = tweetText;
      if (
        tweetText.length < 50 ||
        tweetText.toLowerCase().includes("post") ||
        tweetText.toLowerCase().includes("tweet")
      ) {
        const tweetPrompt = `You are ${runtime.character.name}. Create an interesting tweet based on this context:

Context: ${tweetText}

Your interests: ${runtime.character.topics?.join(", ") || "technology, AI, web3"}
Your style: ${runtime.character.style?.all?.join(", ") || "thoughtful, engaging"}

Generate a tweet that:
- Is under 280 characters
- Reflects your personality and interests
- Is engaging and conversational
- Doesn't use hashtags unless truly relevant
- Doesn't ask questions at the end
- Is not generic or promotional

Tweet:`;

        const response = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: tweetPrompt,
          max_tokens: 100,
          temperature: 0.8,
        });

        finalTweetText = response.trim();
      }

      // Post the tweet
      const result = await client.twitterClient.sendTweet(finalTweetText);

      if (result && result.data) {
        const tweetData = result.data.data || result.data;
        // Extract tweet ID from the response - handle different response formats
        let tweetId: string;
        if ("id" in tweetData) {
          tweetId = tweetData.id;
        } else if ((tweetData as any).data?.id) {
          tweetId = (tweetData as any).data.id;
        } else {
          tweetId = Date.now().toString();
        }
        const tweetUrl = `https://twitter.com/${client.profile.username}/status/${tweetId}`;

        logger.info(`Successfully posted tweet: ${tweetId}`);

        // Create memory of the posted tweet
        await runtime.createMemory(
          {
            entityId: runtime.agentId,
            content: {
              text: finalTweetText,
              url: tweetUrl,
              source: "twitter",
              action: "POST_TWEET",
            },
            roomId: message.roomId,
          },
          "messages",
        );

        if (callback) {
          await callback({
            text: `I've posted a tweet: "${finalTweetText}"\n\nView it here: ${tweetUrl}`,
            metadata: {
              tweetId: tweetId,
              tweetUrl,
            },
          });
        }

        return true;
      } else {
        throw new Error("Failed to post tweet - no response data");
      }
    } catch (error) {
      logger.error("Error posting tweet:", error);

      if (callback) {
        await callback({
          text: `Sorry, I couldn't post the tweet. Error: ${error.message}`,
          metadata: { error: error.message },
        });
      }

      return false;
    }
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "Post a tweet about the importance of open source AI",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll post a tweet about open source AI for you.",
          action: "POST_TWEET",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Tweet something interesting about web3",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll share an interesting thought about web3 on Twitter.",
          action: "POST_TWEET",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Share your thoughts on the future of technology on Twitter",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll post my thoughts on the future of technology.",
          action: "POST_TWEET",
        },
      },
    ],
  ],
};
