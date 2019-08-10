db = DB.open "sqlite3://./store.db"
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA foreign_keys = ON")

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

  env.response.content_type = "application/json"

  if !username || !password
    env.response << {error: "username or password not provided"}.to_json
    next
  end

  username = username.as(String)
  password = password.as(String)

  user = db.query_one?("SELECT username, password FROM users WHERE username = ?", username, as: {
    username: String,
    password: String,
  })

  env.response.content_type = "application/json"

  if user
    stored_password = Crypto::Bcrypt::Password.new(user["password"])
    if stored_password.verify(password)
      exp = Time.now.to_unix + (60 * 30)
      payload = {username: user["username"], exp: exp}
      jwt = JWT.encode(payload, "12345", JWT::Algorithm::HS256)
      {token: jwt, expiresIn: "30 minutes"}.to_json
    else
      {error: "Authentication Failed"}.to_json
    end
  else
    {error: "User not found"}.to_json
  end
end

class HTTP::Server
  class Context
    property! auth_id : Float64 | Int64 | Slice(UInt8) | String | Nil
  end
end

class AuthHandler < Kemal::Handler
  exclude ["/login", "/register"], "POST"
  exclude ["/", "/install"], "GET"
  exclude ["/*"], "OPTIONS" # required for cors to work

  def call(env)
    return call_next(env) if exclude_match?(env)

    token = env.params.json["token"]?

    if !token
      token = env.request.headers["Token"]?
    end

    if !token
      env.response.content_type = "application/json"
      env.response.status_code = 401
      env.response << {"error": "Authentication Failed: No Token Provided"}.to_json
      return env
    end

    token = token.as(String)

    # required or the rescue errors are sent without CORS
    # for some reason before_all is not called here :/
    env.response.headers["Access-Control-Allow-Origin"] = "*"

    begin
      token_decoded = JWT.decode(token, "12345", JWT::Algorithm::HS256)
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
      DB.open "sqlite3://./store.db" do |db|
        env.auth_id = db.scalar("SELECT id FROM users WHERE username = ?", token_decoded[0]["username"].as_s)
      end
      return call_next(env)
    end
  end
end
