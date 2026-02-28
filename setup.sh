#!/bin/bash

echo "🚀 VPROJECT Bot - Setup & Start Script"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
fi

# Register commands
echo "🔧 Registering slash commands..."
npm run register

if [ $? -eq 0 ]; then
    echo "✅ Commands registered successfully"
else
    echo "❌ Failed to register commands"
    exit 1
fi

echo ""
echo "⚠️  IMPORTANT: Enable these intents in Discord Developer Portal:"
echo "   https://discord.com/developers/applications"
echo "   1. Go to Bot section"
echo "   2. Enable: SERVER MEMBERS INTENT"
echo "   3. Enable: MESSAGE CONTENT INTENT"
echo "   4. Click Save Changes"
echo ""
echo "Press Enter when you've enabled the intents..."
read

# Start the bot
echo ""
echo "🤖 Starting bot..."
echo "🌐 Web panel: http://localhost:${PORT:-3001}"
echo ""
npm start
