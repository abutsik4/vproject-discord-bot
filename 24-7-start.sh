#!/bin/bash

# VPROJECT Bot - 24/7 Startup & Management Script
# Supports: PM2, Docker, Systemd, and Direct Node.js execution

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BOT_NAME="vproject-bot"
PORT=5011
LOG_DIR="./logs"
PID_FILE="${LOG_DIR}/bot.pid"

# Ensure logs directory exists
mkdir -p "$LOG_DIR"

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   VPROJECT Bot - 24/7 Management       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        exit 1
    fi
    
    NODE_VERSION=$(node -v)
    print_success "Node.js $NODE_VERSION found"
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        exit 1
    fi
    
    NPM_VERSION=$(npm -v)
    print_success "npm $NPM_VERSION found"
    
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed. Installing..."
        npm install
        print_success "Dependencies installed"
    fi
    echo ""
}

setup_pm2() {
    print_info "Setting up PM2..."
    
    if ! command -v pm2 &> /dev/null; then
        print_warning "PM2 not found globally. Installing..."
        npm install -g pm2
        print_success "PM2 installed globally"
    fi
    
    # Stop any existing instance
    pm2 delete "$BOT_NAME" 2>/dev/null || true
    
    # Start with ecosystem config
    pm2 start ecosystem.config.js --name "$BOT_NAME"
    pm2 save
    
    print_success "PM2 ecosystem started"
    print_info "Bot running on port $PORT"
    print_info "View logs: pm2 logs $BOT_NAME"
    echo ""
}

setup_systemd() {
    print_info "Setting up systemd service..."
    
    if [ ! -f "vproject-bot.service" ]; then
        print_error "vproject-bot.service file not found!"
        exit 1
    fi
    
    # Copy service file
    sudo cp vproject-bot.service /etc/systemd/system/
    sudo systemctl daemon-reload
    
    # Enable and start
    sudo systemctl enable vproject-bot
    sudo systemctl start vproject-bot
    
    print_success "Systemd service installed and started"
    print_info "Manage service: sudo systemctl [start|stop|restart|status] vproject-bot"
    print_info "View logs: sudo journalctl -u vproject-bot -f"
    echo ""
}

start_direct() {
    print_info "Starting bot directly with Node.js..."
    print_warning "This is for development only. For production, use PM2 or systemd."
    echo ""
    
    # Run with auto-restart on error (using a loop)
    while true; do
        print_info "Starting bot ($(date))"
        node src/index.js || {
            EXIT_CODE=$?
            print_error "Bot crashed with code $EXIT_CODE. Restarting in 5 seconds..."
            sleep 5
        }
    done
}

show_status() {
    echo ""
    print_header
    print_info "Current Status:"
    echo ""
    
    if command -v pm2 &> /dev/null; then
        print_info "PM2 Status:"
        pm2 list || print_warning "No PM2 apps running"
        echo ""
        print_info "Recent logs:"
        pm2 logs "$BOT_NAME" --lines 10 --nostream 2>/dev/null || true
    elif systemctl is-active --quiet vproject-bot 2>/dev/null; then
        print_info "Systemd Service:"
        sudo systemctl status vproject-bot --no-pager || true
        echo ""
        print_info "Recent logs:"
        sudo journalctl -u vproject-bot -n 10 --no-pager || true
    else
        print_warning "Bot is not running through PM2 or systemd"
    fi
    echo ""
}

show_menu() {
    echo ""
    print_header
    echo "Select startup method:"
    echo ""
    echo "  1) PM2 (Recommended for production)"
    echo "  2) Systemd (For Linux servers)"
    echo "  3) Direct Node.js (Development only)"
    echo "  4) Show status"
    echo "  5) Stop bot"
    echo "  6) View logs"
    echo "  7) Exit"
    echo ""
    read -p "Enter choice [1-7]: " choice
}

stop_bot() {
    print_info "Stopping bot..."
    
    if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q "$BOT_NAME"; then
        pm2 stop "$BOT_NAME"
        print_success "Bot stopped via PM2"
    elif systemctl is-active --quiet vproject-bot 2>/dev/null; then
        sudo systemctl stop vproject-bot
        print_success "Bot stopped via systemd"
    else
        print_warning "Bot not found running"
    fi
}

view_logs() {
    echo ""
    if command -v pm2 &> /dev/null && pm2 list 2>/dev/null | grep -q "$BOT_NAME"; then
        print_info "PM2 Logs (press Ctrl+C to exit):"
        pm2 logs "$BOT_NAME"
    elif systemctl is-active --quiet vproject-bot 2>/dev/null; then
        print_info "Systemd Logs (press Ctrl+C to exit):"
        sudo journalctl -u vproject-bot -f
    elif [ -f "$LOG_DIR/out.log" ]; then
        print_info "Node.js Logs:"
        tail -f "$LOG_DIR/out.log"
    else
        print_error "No logs found"
    fi
}

# Main execution
main() {
    print_header
    
    check_dependencies
    
    # If argument provided, use it directly
    if [ $# -eq 1 ]; then
        case $1 in
            pm2)
                setup_pm2
                ;;
            systemd)
                setup_systemd
                ;;
            direct)
                start_direct
                ;;
            status)
                show_status
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Usage: $0 [pm2|systemd|direct|status]"
                exit 1
                ;;
        esac
    else
        # Interactive menu
        while true; do
            show_menu
            
            case $choice in
                1)
                    setup_pm2
                    ;;
                2)
                    setup_systemd
                    ;;
                3)
                    start_direct
                    ;;
                4)
                    show_status
                    ;;
                5)
                    stop_bot
                    ;;
                6)
                    view_logs
                    ;;
                7)
                    print_success "Goodbye!"
                    exit 0
                    ;;
                *)
                    print_error "Invalid choice"
                    ;;
            esac
        done
    fi
}

# Run main function
main "$@"
