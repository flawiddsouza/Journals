curl -fsSL https://crystal-lang.org/install.sh | sudo bash

cd API
shards install
cp .env.example .env

cd ..

cd Web-UI
npm install
cp config.js.example config.js

echo "
set -g mouse on
" > ~/.tmux.conf

sudo apt-get install tmux -y
