require "kemal"
require "sqlite3"

# start CORS

before_all do |env|
  env.response.headers["Access-Control-Allow-Origin"] = "*"
end

options "/*" do |env|
  env.response.headers["Allow"] = "HEAD,GET,PUT,POST,DELETE,OPTIONS"
  env.response.headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Cache-Control, Accept"

  halt env, 200
end

# end CORS

get "/" do
  "Journals API"
end

db = DB.open "sqlite3://./store.db"

get "/install" do
  db.exec "
    CREATE TABLE IF NOT EXISTS notebooks (
        id INTEGER,
        name TEXT,
        expanded INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER,
        notebook_id INTEGER,
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER,
        section_id INTEGER,
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
    );
  "
  "Installation Complete!"
end

get "/notebooks" do|env|
  env.response.content_type = "application/json"
  db.query_all("SELECT * from notebooks", as: {
    id: Int64,
    name: String,
    expanded: Bool,
    created_at: String,
    updated_at: String
  }).to_json
end

post "/notebooks" do|env|
  notebook_name = env.params.json["notebookName"].as(String)
  result = db.exec "INSERT INTO notebooks(name) VALUES(?)", notebook_name

  env.response.content_type = "application/json"
  { insertedRowId: result.last_insert_id }.to_json
end

Kemal.run
