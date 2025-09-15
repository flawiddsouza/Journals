module CORSUtils
  extend self

  @@allowed_origins : Array(String)? = nil

  # Initialize and log configured origins. Safe to call multiple times.
  def init!
    return unless @@allowed_origins.nil?

    allowed_origins_env = ENV["ALLOWED_ORIGINS"]?
    if allowed_origins_env.nil?
      Log.fatal { "ALLOWED_ORIGINS environment variable must be set!" }
      Log.fatal { "Example: ALLOWED_ORIGINS=http://localhost:5173,https://journals.one" }
      exit(1)
    end

    list = allowed_origins_env.split(",").map(&.strip)
    @@allowed_origins = list

    # Debug: print configured origins at startup
    Log.info { "[CORS] ALLOWED_ORIGINS raw: #{allowed_origins_env.inspect}" }
    Log.info { "[CORS] Parsed allowed origins: #{list.join(", ")}" }
  end

  def allowed_origins : Array(String)
    init!
    @@allowed_origins.not_nil!
  end

  # Apply CORS headers to the response based on Origin and allowlist.
  # Returns true if the origin is allowed (exact match), false otherwise.
  def apply(env : HTTP::Server::Context) : Bool
    origin = env.request.headers["Origin"]?
    list = allowed_origins
    allowed = origin ? list.includes?(origin) : false

    # Debug: log incoming Origin and decision
    Log.info { "[CORS] Incoming Origin: #{origin || "(none)"} | allowed: #{allowed ? "yes" : "no"}" }

    if allowed && origin
      env.response.headers["Access-Control-Allow-Origin"] = origin
      env.response.headers["Vary"] = "Origin"
      env.response.headers["Access-Control-Allow-Credentials"] = "true"
    else
      env.response.headers["Access-Control-Allow-Origin"] = "*"
    end

    # Debug: log what headers were set
    Log.info { "[CORS] Set headers: Access-Control-Allow-Origin=#{env.response.headers["Access-Control-Allow-Origin"]?} | Access-Control-Allow-Credentials=#{env.response.headers["Access-Control-Allow-Credentials"]?}" }

    allowed
  end
end
