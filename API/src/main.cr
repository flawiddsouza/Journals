require "kemal"
require "sqlite3"
require "crypto/bcrypt"
require "jwt"

# enable cors
require "./cors"

# auth middleware
require "./auth_handler"
add_handler AuthHandler.new

# routes
require "./routes"

Kemal.config.port = 9900
Kemal.run
