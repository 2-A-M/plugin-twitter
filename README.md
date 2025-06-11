# Eliza Twitter/X Client

This package provides Twitter/X integration for the Eliza AI agent using Twitter API v2.

## Features

- Autonomous tweet posting with configurable intervals
- Timeline monitoring and interaction
- Mention and reply handling
- Search functionality
- Direct message support
- Advanced timeline algorithms with weighted scoring
- Action processing and automated responses
- Comprehensive caching system

## Setup Guide

### Prerequisites

- Twitter Developer Account with API v2 access
- Twitter API v2 credentials (API Key, API Secret, Access Token, Access Token Secret)
- Node.js and bun installed

### Step 1: Configure Environment Variables

Create or edit `.env` file in your project root:

```bash
# Required Twitter API v2 Credentials
TWITTER_API_KEY=                    # Your Twitter API Key
TWITTER_API_SECRET_KEY=             # Your Twitter API Secret Key  
TWITTER_ACCESS_TOKEN=               # Your Access Token
TWITTER_ACCESS_TOKEN_SECRET=        # Your Access Token Secret

# Basic Configuration
TWITTER_DRY_RUN=false              # Set to true for testing without posting
TWITTER_TARGET_USERS=              # Comma-separated usernames to target (use "*" for all)
TWITTER_RETRY_LIMIT=5              # Maximum retry attempts for failed operations
TWITTER_POLL_INTERVAL=120          # Timeline polling interval (seconds)

# Post Generation Settings
TWITTER_POST_ENABLE=false          # Enable autonomous tweet posting
TWITTER_POST_INTERVAL_MIN=90       # Minimum interval between posts (minutes)
TWITTER_POST_INTERVAL_MAX=180      # Maximum interval between posts (minutes)
TWITTER_POST_IMMEDIATELY=false     # Skip intervals and post immediately
TWITTER_POST_INTERVAL_VARIANCE=0.2 # Random variance factor for posting intervals

# Interaction Settings
TWITTER_SEARCH_ENABLE=true         # Enable timeline monitoring and interactions
TWITTER_INTERACTION_INTERVAL_MIN=15    # Minimum interval between interactions (minutes)
TWITTER_INTERACTION_INTERVAL_MAX=30    # Maximum interval between interactions (minutes)
TWITTER_INTERACTION_INTERVAL_VARIANCE=0.3  # Random variance for interaction intervals
TWITTER_AUTO_RESPOND_MENTIONS=true     # Automatically respond to mentions
TWITTER_AUTO_RESPOND_REPLIES=true      # Automatically respond to replies
TWITTER_MAX_INTERACTIONS_PER_RUN=10    # Maximum interactions processed per cycle

# Timeline Algorithm Configuration
TWITTER_TIMELINE_ALGORITHM=weighted    # Algorithm: "weighted" or "latest"
TWITTER_TIMELINE_USER_BASED_WEIGHT=3   # Weight for user-based scoring
TWITTER_TIMELINE_TIME_BASED_WEIGHT=2   # Weight for time-based scoring  
TWITTER_TIMELINE_RELEVANCE_WEIGHT=5    # Weight for relevance scoring

# Advanced Settings
TWITTER_MAX_TWEET_LENGTH=4000      # Maximum tweet length (for threads)
TWITTER_DM_ONLY=false             # Only interact via direct messages
TWITTER_ENABLE_ACTION_PROCESSING=false  # Enable timeline action processing
TWITTER_ACTION_INTERVAL=240       # Action processing interval (minutes)
```

### Step 2: Initialize the Client

```typescript
import { TwitterClientInterface } from "@elizaos/plugin-twitter";

const twitterPlugin = {
    name: "twitter",
    description: "Twitter client",
    services: [TwitterService],
};

// Register with your Eliza runtime
runtime.registerPlugin(twitterPlugin);
```

## Authentication

This plugin uses **Twitter API v2** with OAuth 1.0a authentication. You need:

1. **Twitter Developer Account**: Apply at https://developer.twitter.com
2. **API v2 Access**: Ensure your app has API v2 access enabled
3. **Credentials**: Generate API Key, API Secret, Access Token, and Access Token Secret

### Getting Twitter API Credentials

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app or use an existing one
3. Navigate to "Keys and tokens"
4. Generate/copy:
   - API Key (`TWITTER_API_KEY`)
   - API Secret Key (`TWITTER_API_SECRET_KEY`)
   - Access Token (`TWITTER_ACCESS_TOKEN`)
   - Access Token Secret (`TWITTER_ACCESS_TOKEN_SECRET`)

## Features

### Autonomous Posting

When `TWITTER_POST_ENABLE=true`, the client automatically generates and posts tweets:
- Configurable posting intervals with randomization
- Character-based content generation
- Support for long-form tweets (up to 4000 characters)
- Dry-run mode for testing

### Timeline Monitoring

The client monitors and processes the Twitter timeline:
- **Weighted Algorithm**: Scores tweets based on user relationships, time, and relevance
- **Latest Algorithm**: Processes tweets in chronological order
- Configurable interaction limits and intervals
- Smart caching to avoid duplicate processing

### Interaction Handling

Automatically handles:
- **Mentions**: Responds to tweets mentioning the bot
- **Replies**: Handles replies to the bot's tweets
- **Direct Messages**: Processes DMs when enabled
- **Target Users**: Can be configured to only interact with specific users

### Search and Discovery

- Timeline-based search and interaction
- Configurable search intervals
- Relevance-based filtering
- User targeting with wildcard support

### Advanced Features

- **Request Queue**: Manages API rate limiting with exponential backoff
- **Tweet Caching**: Efficient caching system for processed tweets
- **Error Handling**: Robust retry mechanisms with configurable limits
- **State Management**: Persistent state tracking across restarts

## Configuration Options

### Timeline Algorithms

**Weighted Algorithm** (default):
- Combines user relationship, time, and relevance scores
- Prioritizes tweets from important users
- Balances recent content with relevant older content

**Latest Algorithm**:
- Processes tweets in chronological order
- Simpler, more predictable behavior
- Good for high-volume timelines

### Target User Configuration

```bash
# Interact with everyone (default)
TWITTER_TARGET_USERS=

# Interact with specific users
TWITTER_TARGET_USERS=user1,user2,user3

# Interact with everyone (explicit wildcard)
TWITTER_TARGET_USERS=*
```

### Interval Configuration

All intervals support variance for more natural behavior:
```bash
# Base interval: 90-180 minutes
TWITTER_POST_INTERVAL_MIN=90
TWITTER_POST_INTERVAL_MAX=180
# With 20% variance: actual range ~72-216 minutes
TWITTER_POST_INTERVAL_VARIANCE=0.2
```

## Development

### Testing

```bash
# Run tests
bun test

# Run with debug logging  
DEBUG=eliza:* bun start

# Test without posting
TWITTER_DRY_RUN=true bun start
```

### Common Issues

#### Authentication Failures
- Verify all four API credentials are correctly set
- Ensure your Twitter app has API v2 access enabled
- Check that Access Token permissions match your use case
- Verify your developer account is in good standing

#### Rate Limiting
- The client includes built-in rate limiting and retry mechanisms
- Adjust `TWITTER_RETRY_LIMIT` if experiencing frequent failures
- Consider increasing polling intervals for high-volume accounts

#### No Interactions
- Verify `TWITTER_SEARCH_ENABLE=true`
- Check `TWITTER_TARGET_USERS` configuration
- Ensure the timeline contains relevant content
- Review `TWITTER_MAX_INTERACTIONS_PER_RUN` setting

#### Timeline Issues
- Try switching between "weighted" and "latest" algorithms
- Adjust timeline weight parameters for better relevance
- Check `TWITTER_POLL_INTERVAL` for timeline refresh rate

## Security Notes

- Store credentials in environment variables, never in code
- Use `.env.local` or similar for local development
- Regularly rotate API keys and tokens
- Monitor API usage in Twitter Developer Portal
- Enable only necessary permissions for Access Tokens

## API Usage

This plugin uses Twitter API v2 endpoints:
- **Timeline endpoints**: For fetching home timeline and user tweets
- **Tweet endpoints**: For posting tweets and fetching individual tweets
- **User endpoints**: For user profile information
- **Search endpoints**: For content discovery

Monitor your API usage in the Twitter Developer Portal to avoid rate limits.

## Support

For issues or questions:
1. Check the Common Issues section above
2. Enable debug logging: `DEBUG=eliza:*`
3. Verify your API credentials and permissions
4. Check Twitter API v2 status and limits
5. Open an issue with:
   - Error messages and logs
   - Configuration details (without credentials)
   - Steps to reproduce
