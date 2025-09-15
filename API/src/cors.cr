before_all do |env|
  CORSUtils.apply(env)
end

options "/*" do |env|
  env.response.headers["Access-Control-Allow-Methods"] = "HEAD,GET,PUT,POST,DELETE,OPTIONS"
  env.response.headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Cache-Control, Accept, Token"
  env.response.headers["Access-Control-Allow-Credentials"] = "true"

  halt env, 200
end
