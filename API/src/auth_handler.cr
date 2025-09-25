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

  user = db.query_one?("SELECT username FROM users WHERE username = ?", username, as: {
    username: String,
  })

  if user
    env.response << {"error": "User already exists"}.to_json
    next
  end

  hashed_password = Crypto::Bcrypt::Password.create(password).to_s
  result = db.exec "INSERT INTO users(username, password) VALUES(?, ?)", username, hashed_password

  {success: true}.to_json
end

post "/login" do |env|
  username = env.params.json["username"]?
  password = env.params.json["password"]?
  duration = env.params.json["duration"]?

  env.response.content_type = "application/json"

  if !username || !password
    env.response << {error: "username or password not provided"}.to_json
    next
  end

  username = username.as(String)
  password = password.as(String)
  duration = duration != nil ? duration.as(String) : ""

  user = db.query_one?("SELECT username, password FROM users WHERE username = ?", username, as: {
    username: String,
    password: String,
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
      {token: jwt, expiresIn: "1 hour"}.to_json
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
      env.auth_id = db.scalar("SELECT id FROM users WHERE username = ?", token_decoded[0]["username"].as_s).as(Int64)
      return call_next(env)
    end
  end
end
