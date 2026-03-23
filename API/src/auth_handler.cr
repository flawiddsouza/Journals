def log_activity(user_id : Int64, action : String)
  logging_enabled = db.scalar("SELECT value FROM app_settings WHERE key = 'activity_logging'").as(String?)
  return unless logging_enabled == "true"
  db.exec "INSERT INTO activity_log (user_id, action) VALUES (?, ?)", user_id, action
end

post "/register" do |env|
  username = env.params.json["username"]?
  password = env.params.json["password"]?

  env.response.content_type = "application/json"

  if !username || !password
    env.response << {error: "username or password not provided"}.to_json
    next
  end

  username = username.as(String)
  password = password.as(String)

  allow_reg = db.scalar("SELECT value FROM app_settings WHERE key = 'allow_registration'").as(String?)
  if allow_reg != "true"
    env.response.status_code = 403
    env.response << {error: "Registration is disabled"}.to_json
    next
  end

  user = db.query_one?("SELECT username FROM users WHERE username = ?", username, as: {
    username: String,
  })

  if user
    env.response << {"error": "User already exists"}.to_json
    next
  end

  hashed_password = Crypto::Bcrypt::Password.create(password).to_s

  role = "user"
  db.transaction do |tx|
    count = tx.connection.scalar("SELECT COUNT(*) FROM users").as(Int64)
    role = "admin" if count == 0
    tx.connection.exec "INSERT INTO users(username, password, role) VALUES(?, ?, ?)", username, hashed_password, role
  end

  {success: true}.to_json
end

post "/login" do |env|
  username = env.params.json["username"]?
  password = env.params.json["password"]?
  duration = env.params.json["duration"]?
  refresh  = env.params.json["refresh"]?.try(&.as(Bool)) || false

  env.response.content_type = "application/json"

  if !username || !password
    env.response << {error: "username or password not provided"}.to_json
    next
  end

  username = username.as(String)
  password = password.as(String)
  duration = duration != nil ? duration.as(String) : ""

  user = db.query_one?("SELECT id, username, password, role FROM users WHERE username = ?", username, as: {
    id: Int64,
    username: String,
    password: String,
    role: String,
  })

  env.response.content_type = "application/json"

  if user
    stored_password = Crypto::Bcrypt::Password.new(user["password"])
    if stored_password.verify(password)
      # default timeout
      token_timeout = 60 * 9 # 9 hours
      if duration === "30 Minutes"
        token_timeout = 30 # 30 minutes
      end
      exp = Time.utc.to_unix + (60 * token_timeout)
      payload = {username: user["username"], exp: exp}
      jwt = JWT.encode(payload, ENV["JWT_SECRET"], JWT::Algorithm::HS256)
      # Also set HttpOnly cookie for cross-origin <img>/<a> usage
      max_age = exp - Time.utc.to_unix
      env.response.headers.add "Set-Cookie", "token=#{jwt}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=#{max_age}"
      log_activity(user["id"], "login") unless refresh
      {token: jwt, expiresIn: "1 hour", role: user["role"]}.to_json
    else
      {error: "Authentication Failed"}.to_json
    end
  else
    {error: "User not found"}.to_json
  end
end

class HTTP::Server
  class Context
    property! auth_id : Int64
    property! auth_role : String
  end
end

class AuthHandler < Kemal::Handler
  exclude ["/login", "/register"], "POST"
  exclude ["/", "/install"], "GET"
  exclude ["/*"], "OPTIONS" # required for cors to work

  def call(env)
    return call_next(env) if exclude_match?(env)

    # required or the rescue errors are sent without CORS
    # for some reason before_all is not called here :/
    CORSUtils.apply(env)

    token = env.params.json["token"]?

    if !token
      token = env.request.headers["Token"]?
    end

    # Fallback to cookie-based token (for <img>/<a> requests)
    if !token
      if cookie = env.request.cookies["token"]?
        token = cookie.value
      end
    end

    if !token
      env.response.content_type = "application/json"
      env.response.status_code = 401
      env.response << {"error": "Authentication Failed: No Token Provided"}.to_json
      return env
    end

    token = token.as(String)

    begin
      token_decoded = JWT.decode(token, ENV["JWT_SECRET"], JWT::Algorithm::HS256)
    rescue JWT::ExpiredSignatureError
      env.response.content_type = "application/json"
      env.response.status_code = 401
      env.response << {"error": "Authentication Failed: Token Expired"}.to_json
      return env
    rescue JWT::VerificationError
      env.response.content_type = "application/json"
      env.response.status_code = 401
      env.response << {"error": "Authentication Failed: Invalid Token"}.to_json
      return env
    rescue JWT::DecodeError
      env.response.content_type = "application/json"
      env.response.status_code = 401
      env.response << {"error": "Authentication Failed: Invalid Token"}.to_json
      return env
    else
      user_row = db.query_one?(
        "SELECT id, role, last_seen_at FROM users WHERE username = ?",
        token_decoded[0]["username"].as_s,
        as: {id: Int64, role: String, last_seen_at: String | Nil}
      )

      if user_row.nil?
        env.response.content_type = "application/json"
        env.response.status_code = 401
        env.response << {"error": "Authentication Failed: User not found"}.to_json
        return env
      end

      env.auth_id   = user_row[:id]
      env.auth_role = user_row[:role]

      last_seen = user_row[:last_seen_at]
      should_update = last_seen.nil? || (Time.utc - Time.parse(last_seen, "%Y-%m-%d %H:%M:%S", Time::Location::UTC)) > 60.seconds
      if should_update
        db.exec "UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?", env.auth_id
      end

      return call_next(env)
    end
  end
end
