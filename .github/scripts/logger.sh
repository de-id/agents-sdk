#!/bin/bash

# GitHub Actions Logger Script for Public Repositories
# Usage: logger -l <level> -m <message>
# Levels: info, warn, error, debug

# Color codes with bold
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
NC='\033[0m' # No Color

# Default values
LOG_LEVEL=""
MESSAGE=""

# Parse command line arguments
while getopts "l:m:" opt; do
  case $opt in
    l)
      LOG_LEVEL="$OPTARG"
      ;;
    m)
      MESSAGE="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
    :)
      echo "Option -$OPTARG requires an argument." >&2
      exit 1
      ;;
  esac
done

# Validate inputs
if [ -z "$LOG_LEVEL" ]; then
  echo "Error: Log level (-l) is required" >&2
  echo "Usage: logger -l <level> -m <message>" >&2
  echo "Levels: info, warn, error, debug" >&2
  exit 1
fi

if [ -z "$MESSAGE" ]; then
  echo "Error: Message (-m) is required" >&2
  echo "Usage: logger -l <level> -m <message>" >&2
  exit 1
fi

# Convert log level to uppercase for display
LOG_LEVEL_UPPER=$(echo "$LOG_LEVEL" | tr '[:lower:]' '[:upper:]')

# Process based on log level
case "$LOG_LEVEL" in
  info|INFO)
    echo -e "${GREEN}INFO:${NC} $MESSAGE"
    ;;
  warn|WARN)
    echo -e "${YELLOW}WARN:${NC} $MESSAGE"
    ;;
  error|ERROR)
    echo -e "${RED}ERROR:${NC} $MESSAGE"
    exit 1
    ;;
  debug|DEBUG)
    # Only print debug messages when GitHub Actions is in debug mode
    if [[ "$RUNNER_DEBUG" == "1" || "$ACTIONS_STEP_DEBUG" == "true" || "$ACTIONS_RUNNER_DEBUG" == "true" ]]; then
      echo -e "${YELLOW}DEBUG:${NC} $MESSAGE"
    fi
    ;;
  *)
    echo "Error: Invalid log level '$LOG_LEVEL'" >&2
    echo "Valid levels: info, warn, error, debug" >&2
    exit 1
    ;;
esac