require "kemal"
require "sqlite3"
require "crypto/bcrypt"
require "jwt"
require "file_utils"

# enable cors
require "./cors"

# auth middleware
require "./auth_handler"
add_handler AuthHandler.new

# routes
require "./routes"

static_headers do |response, filepath, filestat|
  response.headers.add("Access-Control-Allow-Origin", "*")
end

Kemal.config.port = 9900
Kemal.run
