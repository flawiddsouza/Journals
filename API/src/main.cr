require "kemal"
require "sqlite3"
require "crypto/bcrypt"
require "jwt"
require "file_utils"
require "mime"
require "dotenv"

if File.exists?("./.env")
  Dotenv.load
end

# Initialize CORS configuration early (after env loaded)
require "./cors_utils"
CORSUtils.init!

module App
  DATA_DIRECTORY = "./data"

  # Lazily initialize and reuse a single DB connection
  @@db : DB::Database?

  def self.db : DB::Database
    @@db ||= begin
      db = DB.open "sqlite3://#{DATA_DIRECTORY}/store.db"
      db.exec("PRAGMA journal_mode = WAL")
      db.exec("PRAGMA foreign_keys = ON")
      if cache_size = ENV["SQLITE_CACHE_SIZE"]?
        db.exec("PRAGMA cache_size = #{cache_size}")
      end
      db
    end
    @@db.not_nil!
  end
end

def db : DB::Database
  App.db
end

def data_directory : String
  App::DATA_DIRECTORY
end

# enable cors
require "./cors"

# auth middleware
require "./auth_handler"
add_handler AuthHandler.new

# routes
require "./routes"

Kemal.config.port = 9900
Kemal.run
