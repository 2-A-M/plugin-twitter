# Eliza Twitter/X Client

This package provides Twitter/X integration for the Eliza AI agent using the official Twitter API v2.

## 🚨 TL;DR - Quick Setup

**Just want your bot to post tweets? Here's the fastest path:**

1. **Get Twitter Developer account** → https://developer.twitter.com
2. **Create an app** → Enable "Read and write" permissions
3. **Get OAuth 1.0a credentials** (NOT OAuth 2.0!):
   - API Key & Secret (from "Consumer Keys")
   - Access Token & Secret (from "Authentication Tokens")
4. **Add to `.env`:**
   ```bash
   TWITTER_API_KEY=xxx
   TWITTER_API_SECRET_KEY=xxx
   TWITTER_ACCESS_TOKEN=xxx
   TWITTER_ACCESS_TOKEN_SECRET=xxx
   TWITTER_POST_ENABLE=true
   TWITTER_POST_IMMEDIATELY=true
   ```
5. **Run:** `bun start`

⚠️ **Common mistake:** Using OAuth 2.0 credentials instead of OAuth 1.0a - see [Step 3](#step-3-get-the-right-credentials-oauth-10a) for details!

## Features

- ✅ **Autonomous tweet posting** with configurable intervals
- ✅ **Timeline monitoring** and interaction
- ✅ **Mention and reply handling**
- ✅ **Search functionality**
- ✅ **Direct message support**
- ✅ **Advanced timeline algorithms** with weighted scoring
- ✅ **Comprehensive caching system**
- ✅ **Built-in rate limiting and retry mechanisms**

## Prerequisites

- Twitter Developer Account with API v2 access
- Twitter OAuth 1.0a credentials (NOT OAuth 2.0)
- Node.js and bun installed

## 🚀 Quick Start

### Step 1: Get Twitter Developer Access

1. Apply for a developer account at https://developer.twitter.com
2. Create a new app in the [Developer Portal](https://developer.twitter.com/en/portal/projects-and-apps)
3. Ensure your app has API v2 access

### Step 2: Configure App Permissions for Posting

**⚠️ CRITICAL: Default apps can only READ. You must enable WRITE permissions to post tweets!**

1. In your app settings, go to **"User authentication settings"**
2. Configure exactly as shown:

   **App permissions**: `Read and write` ✅
   
   **Type of App**: `Web App, Automated App or Bot`
   
   **Required URLs** (copy these exactly):
   ```
   Callback URI: http://localhost:3000/callback
   Website URL: https://github.com/elizaos/eliza
   ```
   
   **Optional fields**:
   ```
   Organization name: ElizaOS
   Organization URL: https://github.com/elizaos/eliza
   ```

3. Click **Save**

### Step 3: Get the RIGHT Credentials (OAuth 1.0a)

**⚠️ IMPORTANT: You need OAuth 1.0a credentials, NOT OAuth 2.0!**

In your app's **"Keys and tokens"** page, you'll see several sections. Here's what to use:

```
✅ USE THESE (OAuth 1.0a):
┌─────────────────────────────────────────────────┐
│ Consumer Keys                                   │
│ ├─ API Key: xxx...xxx          → TWITTER_API_KEY │
│ └─ API Key Secret: xxx...xxx   → TWITTER_API_SECRET_KEY │
│                                                 │
│ Authentication Tokens                           │
│ ├─ Access Token: xxx...xxx     → TWITTER_ACCESS_TOKEN │
│ └─ Access Token Secret: xxx    → TWITTER_ACCESS_TOKEN_SECRET │
└─────────────────────────────────────────────────┘

❌ DO NOT USE THESE (OAuth 2.0):
┌─────────────────────────────────────────────────┐
│ OAuth 2.0 Client ID and Client Secret          │
│ ├─ Client ID: xxx...xxx        ← IGNORE        │
│ └─ Client Secret: xxx...xxx    ← IGNORE        │
│                                                 │
│ Bearer Token                   ← IGNORE        │
└─────────────────────────────────────────────────┘
```

**After enabling write permissions, you MUST:**
1. Click **"Regenerate"** on Access Token & Secret
2. Copy the NEW tokens (old ones won't have write access)
3. Look for "Created with Read and Write permissions" ✅

### Step 4: Configure Environment Variables

Create or edit `.env` file in your project root:

```bash
# REQUIRED: OAuth 1.0a Credentials (from "Consumer Keys" section)
TWITTER_API_KEY=your_api_key_here                    # From "API Key"
TWITTER_API_SECRET_KEY=your_api_key_secret_here      # From "API Key Secret"

# REQUIRED: OAuth 1.0a Tokens (from "Authentication Tokens" section)
TWITTER_ACCESS_TOKEN=your_access_token_here          # Must have "Read and Write"
TWITTER_ACCESS_TOKEN_SECRET=your_token_secret_here   # Regenerate after permission change

# Basic Configuration
TWITTER_DRY_RUN=false              # Set to true to test without posting
TWITTER_POST_ENABLE=true           # Set to true to enable auto-posting

# Optional: Posting Configuration
TWITTER_POST_IMMEDIATELY=true      # Post on startup (great for testing)
TWITTER_POST_INTERVAL_MIN=90       # Minimum minutes between posts
TWITTER_POST_INTERVAL_MAX=180      # Maximum minutes between posts
```

### Step 5: Run Your Bot

```typescript
// Your character should include the twitter plugin
const character = {
    // ... other config
    plugins: [
        "@elizaos/plugin-bootstrap",  // Required for content generation
        "@elizaos/plugin-twitter"      // Twitter functionality
    ],
    postExamples: [                    // Examples for tweet generation
        "Just discovered an amazing pattern in the data...",
        "The future of AI is collaborative intelligence",
        // ... more examples
    ]
};
```

Then start your bot:
```bash
bun run start
```

## 📋 Complete Configuration Reference

```bash
# Required Twitter API v2 Credentials (OAuth 1.0a)
TWITTER_API_KEY=                    # Consumer API Key
TWITTER_API_SECRET_KEY=             # Consumer API Secret
TWITTER_ACCESS_TOKEN=               # Access Token (with write permissions)
TWITTER_ACCESS_TOKEN_SECRET=        # Access Token Secret

# Basic Configuration
TWITTER_DRY_RUN=false              # Set to true for testing without posting
TWITTER_TARGET_USERS=              # Comma-separated usernames to target (use "*" for all)
TWITTER_RETRY_LIMIT=5              # Maximum retry attempts for failed operations
TWITTER_POLL_INTERVAL=120          # Timeline polling interval (seconds)

# Post Generation Settings
TWITTER_POST_ENABLE=false          # Enable autonomous tweet posting
TWITTER_POST_INTERVAL_MIN=90       # Minimum interval between posts (minutes)
TWITTER_POST_INTERVAL_MAX=180      # Maximum interval between posts (minutes)
TWITTER_POST_IMMEDIATELY=false     # Post immediately on startup
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

## 🎯 Common Use Cases

### Just Want to Post Tweets?

```bash
# Minimal setup for posting only
TWITTER_API_KEY=xxx
TWITTER_API_SECRET_KEY=xxx
TWITTER_ACCESS_TOKEN=xxx        # Must have write permissions!
TWITTER_ACCESS_TOKEN_SECRET=xxx

TWITTER_POST_ENABLE=true
TWITTER_POST_IMMEDIATELY=true   # Great for testing
TWITTER_SEARCH_ENABLE=false     # Disable interactions
```

### Want Full Interaction Bot?

```bash
# Full interaction setup
TWITTER_API_KEY=xxx
TWITTER_API_SECRET_KEY=xxx
TWITTER_ACCESS_TOKEN=xxx
TWITTER_ACCESS_TOKEN_SECRET=xxx

TWITTER_POST_ENABLE=true
TWITTER_SEARCH_ENABLE=true
TWITTER_AUTO_RESPOND_MENTIONS=true
TWITTER_AUTO_RESPOND_REPLIES=true
```

### Testing Without Posting?

```bash
# Dry run mode
TWITTER_DRY_RUN=true            # Simulates all actions
TWITTER_POST_ENABLE=true
TWITTER_POST_IMMEDIATELY=true
```

## 🔧 Troubleshooting

### "403 Forbidden" When Posting

This is the #1 issue! Your app has read-only permissions.

**Solution:**
1. Go to app settings → "User authentication settings"
2. Change to "Read and write"
3. Save settings
4. **CRITICAL**: Regenerate your Access Token & Secret
5. Update `.env` with NEW tokens
6. Restart your bot

**How to verify:** In "Keys and tokens", your Access Token should show "Created with Read and Write permissions"

### "Could not authenticate you"

Wrong credentials or using OAuth 2.0 instead of OAuth 1.0a.

**Solution:**
- Use credentials from "Consumer Keys" section (API Key/Secret)
- Use credentials from "Authentication Tokens" section (Access Token/Secret)
- Do NOT use OAuth 2.0 Client ID, Client Secret, or Bearer Token

### Bot Not Posting Automatically

**Checklist:**
- ✅ Is `TWITTER_POST_ENABLE=true`?
- ✅ Is `@elizaos/plugin-bootstrap` installed?
- ✅ Does your character have `postExamples`?
- ✅ Check logs for "Twitter posting is ENABLED"
- ✅ Try `TWITTER_POST_IMMEDIATELY=true` for testing

### Timeline Not Loading

**Common causes:**
- Rate limiting (check Twitter Developer Portal)
- Invalid credentials
- Account restrictions

### "Invalid or expired token"

Your tokens may have been revoked or regenerated.

**Solution:**
1. Go to Twitter Developer Portal
2. Regenerate all tokens
3. Update `.env`
4. Restart bot

## 📚 Advanced Features

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

# Interact with specific users only
TWITTER_TARGET_USERS=user1,user2,user3

# Interact with everyone (explicit)
TWITTER_TARGET_USERS=*
```

### Natural Posting Intervals

All intervals support variance for more human-like behavior:
```bash
# Base interval: 90-180 minutes
TWITTER_POST_INTERVAL_MIN=90
TWITTER_POST_INTERVAL_MAX=180
# With 20% variance: actual range ~72-216 minutes
TWITTER_POST_INTERVAL_VARIANCE=0.2
```

### Request Queue & Rate Limiting

The plugin includes sophisticated rate limiting:
- Automatic retry with exponential backoff
- Request queue to prevent API abuse
- Configurable retry limits
- Built-in caching to reduce API calls

## 🧪 Development & Testing

```bash
# Run tests
bun test

# Run with debug logging  
DEBUG=eliza:* bun start

# Test without posting
TWITTER_DRY_RUN=true bun start
```

### Testing Checklist

1. **Test Auth**: Check logs for successful Twitter login
2. **Test Posting**: Set `TWITTER_POST_IMMEDIATELY=true`
3. **Test Dry Run**: Use `TWITTER_DRY_RUN=true` first
4. **Monitor Logs**: Look for "Twitter posting is ENABLED"

## 🔒 Security Best Practices

- Store credentials in `.env` file (never commit!)
- Use `.env.local` for local development
- Regularly rotate API keys
- Monitor API usage in Developer Portal
- Enable only necessary permissions
- Review [Twitter's automation rules](https://help.twitter.com/en/rules-and-policies/twitter-automation)

## 📊 API Usage & Limits

This plugin uses Twitter API v2 endpoints efficiently:
- **Home Timeline**: Cached and refreshed periodically
- **Tweet Creation**: Rate limited automatically
- **User Lookups**: Cached to reduce calls
- **Search**: Configurable intervals

Monitor your usage at: https://developer.twitter.com/en/portal/dashboard

## 📖 Additional Resources

- [Twitter API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [Twitter OAuth 1.0a Guide](https://developer.twitter.com/en/docs/authentication/oauth-1-0a)
- [Rate Limits Reference](https://developer.twitter.com/en/docs/twitter-api/rate-limits)
- [ElizaOS Documentation](https://github.com/elizaos/eliza)

## 🤝 Contributing

Contributions are welcome! Please:
1. Check existing issues first
2. Follow the code style
3. Add tests for new features
4. Update documentation

## 📝 License

This plugin is part of the ElizaOS project. See the main repository for license information.