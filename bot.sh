#!/bin/bash

# VPROJECT Bot - Quick Management Commands

BOT_NAME="vproject-bot"
PORT=5011

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  VPROJECT Bot - Quick Management${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

case "$1" in
    status|log|logs)
        echo -e "${BLUE}📊 Current Status:${NC}"
        pm2 show $BOT_NAME 2>/dev/null || echo "Bot not running"
        echo ""
        echo -e "${BLUE}📋 Last 50 Log Lines:${NC}"
        pm2 logs $BOT_NAME --lines 50 --nostream
        ;;
    restart)
        echo -e "${BLUE}🔄 Restarting bot...${NC}"
        pm2 restart $BOT_NAME
        echo -e "${GREEN}✅ Bot restarted${NC}"
        ;;
    stop)
        echo -e "${BLUE}⛔ Stopping bot...${NC}"
        pm2 stop $BOT_NAME
        echo -e "${GREEN}✅ Bot stopped${NC}"
        ;;
    start)
        echo -e "${BLUE}▶️  Starting bot...${NC}"
        pm2 start ecosystem.config.js
        echo -e "${GREEN}✅ Bot started${NC}"
        ;;
    web)
        echo -e "${BLUE}🌐 Opening web panel...${NC}"
        echo -e "${GREEN}http://localhost:${PORT}${NC}"
        ;;
    stats)
        echo -e "${BLUE}📊 Web Panel URLs:${NC}"
        echo "  Overview:  http://localhost:${PORT}/"
        echo "  Stats:     http://localhost:${PORT}/stats"
        echo "  Embeds:    http://localhost:${PORT}/embeds"
        echo "  Auto-roles: http://localhost:${PORT}/auto-roles"
        echo ""
        echo -e "${BLUE}📊 Message Data:${NC}"
        if [ -f "data/messages.json" ]; then
            echo "$(cat data/messages.json | jq '.' 2>/dev/null || echo 'Invalid JSON')"
        else
            echo "No message data yet"
        fi
        ;;
    memory)
        echo -e "${BLUE}💾 Memory Usage:${NC}"
        ps aux | grep "[n]ode src/index.js" | awk '{print "PID: " $2 " | Memory: " $6/1024 "MB"}'
        ;;
    *)
        echo -e "${BLUE}Usage: $0 {status|restart|stop|start|web|stats|memory}${NC}"
        echo ""
        echo "Commands:"
        echo "  status    - Show bot status and logs"
        echo "  restart   - Restart the bot"
        echo "  stop      - Stop the bot"
        echo "  start     - Start the bot"
        echo "  web       - Show web panel URL"
        echo "  stats     - Show all stats & data"
        echo "  memory    - Show memory usage"
        echo ""
        echo "Examples:"
        echo "  $0 status          # Check if bot is running"
        echo "  $0 restart         # Restart the bot"
        echo "  $0 logs            # View logs"
        echo ""
esac
