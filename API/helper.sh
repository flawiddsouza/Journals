#!/bin/bash

# Determine the command to run based on the argument
case "$1" in
  install)
    COMMAND="shards install"
    ;;
  run)
    COMMAND="crystal run src/main.cr"
    ;;
  build)
    COMMAND="shards build --release"
    ;;
  *)
    echo "Usage: $0 {install|run|build}"
    echo "  install - Install dependencies"
    echo "  run     - Run the application in development mode"
    echo "  build   - Build the application for production"
    exit 1
    ;;
esac

# Before starting, stop and remove any existing container named 'journals_helper'
if docker ps -a --format '{{.Names}}' | grep -q '^journals_helper$'; then
  echo "Found existing container 'journals_helper' — stopping and removing..."
  docker rm -f journals_helper >/dev/null 2>&1 || true
fi

# Run the Docker command with dependency installation and the chosen command
OPTIONS="-i"
# if interactive terminal, add -t
[ -t 0 ] && OPTIONS="$OPTIONS -t"
docker run $OPTIONS --rm --name journals_helper -v $(pwd):/app -w /app $([ "$1" = "run" ] && echo "-p 9900:9900") ghcr.io/flawiddsouza/useful-docker-images/crystal-sqlite:1.17 $COMMAND
