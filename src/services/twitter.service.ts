import { Service, type IAgentRuntime } from "@elizaos/core";

export class TwitterService extends Service {
  static serviceType = "twitter";
  
  // Add the required abstract property
  capabilityDescription = "The agent is able to send and receive messages on Twitter";
  
  private static instance: TwitterService;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
  }

  static getInstance(): TwitterService {
    if (!TwitterService.instance) {
      TwitterService.instance = new TwitterService();
    }
    return TwitterService.instance;
  }

  static async start(runtime: IAgentRuntime): Promise<TwitterService> {
    const instance = TwitterService.getInstance();
    instance.runtime = runtime;
    return instance;
  }

  async stop(): Promise<void> {
    // Clean up resources if needed
  }
} 