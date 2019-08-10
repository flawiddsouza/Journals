before_all do |env|
  env.response.headers["Access-Control-Allow-Origin"] = "*"
end

options "/*" do |env|
  env.response.headers["Access-Control-Allow-Methods"] = "HEAD,GET,PUT,POST,DELETE,OPTIONS"
  env.response.headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Cache-Control, Accept"

  halt env, 200
end
