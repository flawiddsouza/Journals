cd API
shards install

if [ ! -f .env ]; then
  cp .env.example .env
fi

cd ..

cd Web-UI
npm install
cp config.js.example config.js

echo "
set -g mouse on
" > ~/.tmux.conf

sudo apt-get install tmux -y
