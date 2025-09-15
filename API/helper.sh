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

# Run the Docker command with dependency installation and the chosen command
docker run -i -t --rm -v $(pwd):/app -w /app $([ "$1" = "run" ] && echo "-p 9900:9900") crystallang/crystal:1.17 bash -c "
  # Check if libsqlite3-dev is already installed
  if ! dpkg -l | grep -q libsqlite3-dev; then
    echo 'Installing libsqlite3-dev...'
    apt update && apt install -y libsqlite3-dev
  else
    echo 'libsqlite3-dev is already installed, skipping package installation'
  fi
  
  # Run the specified command
  $COMMAND
"
