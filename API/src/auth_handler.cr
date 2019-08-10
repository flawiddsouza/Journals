class HTTP::Server
  class Context
    property! auth_id : Float64 | Int64 | Slice(UInt8) | String | Nil
  end
end

class AuthHandler < Kemal::Handler
  exclude ["/", "/install"]
  exclude ["/login", "/register"], "POST"

  def call(env)
    return call_next(env) if exclude_match?(env)

    token = env.params.json["token"]?.as(String)

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
    else
      DB.open "sqlite3://./store.db" do |db|
        env.auth_id = db.scalar("SELECT id FROM users WHERE username = ?", token_decoded[0]["username"].as_s)
      end
      return call_next(env)
    end
  end
end
