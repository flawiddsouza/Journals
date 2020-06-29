tmux new-session \; \
    send-keys 'cd API && crystal run src/main.cr' C-m \; \
    split-window -h \; \
    send-keys 'cd Web-UI && npm run dev' C-m \;
