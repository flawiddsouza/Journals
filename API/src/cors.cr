# Whitelist of allowed origins for credential requests
allowed_origins_env = ENV["ALLOWED_ORIGINS"]?
if allowed_origins_env.nil?
  puts "FATAL ERROR: ALLOWED_ORIGINS environment variable must be set!"
  puts "Example: ALLOWED_ORIGINS=http://localhost:5173,https://journals.one"
  exit(1)
end

allowed_origins = allowed_origins_env.split(",").map(&.strip)

before_all do |env|
  origin = env.request.headers["Origin"]?

  if origin && allowed_origins.includes?(origin)
    env.response.headers["Access-Control-Allow-Origin"] = origin
    env.response.headers["Vary"] = "Origin"
  else
    # For non-credentialed requests from unknown origins, allow with *
    # But credentialed requests will be blocked by the browser
    env.response.headers["Access-Control-Allow-Origin"] = "*"
  end
  env.response.headers["Access-Control-Allow-Credentials"] = "true"
end

options "/*" do |env|
  env.response.headers["Access-Control-Allow-Methods"] = "HEAD,GET,PUT,POST,DELETE,OPTIONS"
  env.response.headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Cache-Control, Accept, Token"
  env.response.headers["Access-Control-Allow-Credentials"] = "true"

  halt env, 200
end
