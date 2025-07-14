import { Service, type IAgentRuntime } from "@elizaos/core";

export class TwitterService extends Service {
  static serviceType = "twitter";
  
  // Add the required abstract property
  capabilityDescription = "The agent is able to send and receive messages on Twitter";

  constructor() {
    super();
  }

  static async start(runtime: IAgentRuntime): Promise<TwitterService> {
    const service = new TwitterService();
    service.runtime = runtime;
    // Service initialization can happen here if needed
    return service;
  }

  async stop(): Promise<void> {
    // Clean up resources if needed
  }
} 