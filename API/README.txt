To run:
    crystal run src/main.cr
    Go to http://0.0.0.0:3000 to test the API

Troubleshooting
    Problem:
        /usr/bin/ld: cannot find -lsqlite3 (this usually means you need to install the development package for libsqlite3)
    Solution:
        sudo apt-get install libsqlite3-dev