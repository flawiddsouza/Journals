require "kemal"
require "sqlite3"

# start CORS

before_all do |env|
  env.response.headers["Access-Control-Allow-Origin"] = "*"
end

options "/*" do |env|
  env.response.headers["Access-Control-Allow-Methods"] = "HEAD,GET,PUT,POST,DELETE,OPTIONS"
  env.response.headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Cache-Control, Accept"

  halt env, 200
end

# end CORS

get "/" do
  "Journals API"
end

db = DB.open "sqlite3://./store.db"
db.exec("PRAGMA foreign_keys = ON")

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
        PRIMARY KEY(id),
        FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER,
        section_id INTEGER,
        name TEXT,
        type TEXT,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE
    );
  "
  "Installation Complete!"
end

get "/notebooks" do |env|
  notebooks = db.query_all("SELECT * from notebooks", as: {
    id:         Int64,
    name:       String,
    expanded:   Bool,
    created_at: String,
    updated_at: String,
  })

  hashed_notebooks = [] of Hash(String, Int64 | String | Bool | Array(NamedTuple(id: Int64, name: String)))

  notebooks.each do |notebook|
    hashed_notebooks << {
      "id"         => notebook["id"],
      "name"       => notebook["name"],
      "expanded"   => notebook["expanded"],
      "created_at" => notebook["created_at"],
      "updated_at" => notebook["updated_at"],
      "sections"   => db.query_all("SELECT id, name from sections where notebook_id = ?", notebook["id"], as: {
        id:   Int64,
        name: String,
      }),
    }
  end

  env.response.content_type = "application/json"
  hashed_notebooks.to_json
end

post "/notebooks" do |env|
  notebook_name = env.params.json["notebookName"].as(String)
  result = db.exec "INSERT INTO notebooks(name) VALUES(?)", notebook_name

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

post "/sections" do |env|
  notebook_id = env.params.json["notebookId"].as(Int64)
  section_name = env.params.json["sectionName"].as(String)
  result = db.exec "INSERT INTO sections(notebook_id, name) VALUES(?, ?)", notebook_id, section_name

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

post "/pages" do |env|
  section_id = env.params.json["sectionId"].as(Int64)
  page_type = env.params.json["pageType"].as(String)
  page_name = env.params.json["pageName"].as(String)
  result = db.exec "INSERT INTO pages(section_id, type, name) VALUES(?, ?, ?)", section_id, page_type, page_name

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

get "/pages/:section_id" do |env|
  section_id = env.params.url["section_id"]

  pages = db.query_all("SELECT id, name, type from pages WHERE section_id = ?", section_id, as: {
    id:   Int64,
    name: String,
    type: String,
  })

  env.response.content_type = "application/json"
  pages.to_json
end

delete "/pages/:page_id" do |env|
  page_id = env.params.url["page_id"]
  db.exec "DELETE FROM pages WHERE id = ?", page_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/sections/:section_id" do |env|
  section_id = env.params.url["section_id"]
  db.exec "DELETE FROM sections WHERE id = ?", section_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/notebooks/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  db.exec "DELETE FROM notebooks WHERE id = ?", notebook_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

Kemal.run
