Init:
    shards install # or bash helper.sh install
    cp .env.example .env
    open .env and set JWT_SECRET to a unique value
        You can find random 63-character code at https://www.grc.com/passwords.htm, see: 63 random alpha-numeric characters (a-z, A-Z, 0-9)

To run:
    crystal run src/main.cr # or bash helper.sh run
    Go to http://0.0.0.0:9900 to test the API

Troubleshooting
    Problem:
        /usr/bin/ld: cannot find -lsqlite3 (this usually means you need to install the development package for libsqlite3)
    Solution:
        sudo apt-get install libsqlite3-dev
    Problem:
        /usr/bin/ld: cannot find -lgmp (this usually means you need to install the development package for libgmp)
    Solution:
        sudo apt-get install libgmp-dev

To build for production:
    shards build --release # or bash helper.sh build
    Then you can find the binary at bin/journals
    which can be run like so
        mkdir bin/data
        echo JWT_SECRET=your-jwt-secret > bin/.env
        KEMAL_ENV=production ./bin/journals

To autostart and keep running in the background, you can use pm2:
    pm2 start ./bin/journals --name "Journals"
    pm2 save
