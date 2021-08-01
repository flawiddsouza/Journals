# from: https://davidltran.com/blog/check-tmux-session-exists-script/

session="journals"

# Check if the session exists, discarding output
tmux has-session -t $session 2>/dev/null

# We can check $? for the exit status (zero for success, non-zero for failure)
# $? Expands to the exit status of the most recently executed foreground pipeline.
if [ $? != 0 ]; then
    # create new session
    tmux new-session -s $session \; \
    send-keys 'cd API' C-m 'crystal run src/main.cr' C-m \; \
    split-window -h \; \
    send-keys 'cd Web-UI' C-m 'npm run dev' C-m \;
else
    # attach to existing session
    tmux attach-session -t $session
fi
