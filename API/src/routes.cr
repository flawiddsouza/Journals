get "/" do
  "Journals API"
end

db = DB.open "sqlite3://./store.db"
db.exec("PRAGMA journal_mode = WAL")
db.exec("PRAGMA foreign_keys = ON")

get "/install" do
  db.exec "
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER,
        username TEXT,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id)
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS notebooks (
        id INTEGER,
        name TEXT,
        expanded INTEGER DEFAULT 1,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER,
        notebook_id INTEGER,
        name TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER,
        section_id INTEGER,
        name TEXT,
        type TEXT,
        content TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(section_id) REFERENCES sections(id) ON DELETE CASCADE
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS page_history (
        id INTEGER,
        page_id INTEGER,
        user_id INTEGER,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  "
  db.exec "
    CREATE TABLE IF NOT EXISTS page_uploads (
        id INTEGER,
        page_id INTEGER,
        user_id INTEGER,
        file_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(id),
        FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  "
  "Installation Complete!"
end

get "/notebooks" do |env|
  notebooks = db.query_all("SELECT id, name, expanded from notebooks WHERE user_id = ?", env.auth_id, as: {
    id:       Int64,
    name:     String,
    expanded: Bool,
  })

  hashed_notebooks = [] of Hash(String, Int64 | String | Bool | Array(NamedTuple(id: Int64, name: String, notebook_id: Int64)))

  notebooks.each do |notebook|
    hashed_notebooks << {
      "id"       => notebook["id"],
      "name"     => notebook["name"],
      "expanded" => notebook["expanded"],
      "sections" => db.query_all("SELECT id, name, notebook_id from sections where notebook_id = ?", notebook["id"], as: {
        id:   Int64,
        name: String,
        notebook_id: Int64
      }),
    }
  end

  env.response.content_type = "application/json"
  hashed_notebooks.to_json
end

post "/notebooks" do |env|
  notebook_name = env.params.json["notebookName"].as(String)
  result = db.exec "INSERT INTO notebooks(name, user_id) VALUES(?, ?)", notebook_name, env.auth_id

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

post "/sections" do |env|
  notebook_id = env.params.json["notebookId"].as(Int64)
  section_name = env.params.json["sectionName"].as(String)
  result = db.exec "INSERT INTO sections(notebook_id, name, user_id) VALUES(?, ?, ?)", notebook_id, section_name, env.auth_id

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

post "/pages" do |env|
  section_id = env.params.json["sectionId"].as(Int64)
  page_type = env.params.json["pageType"].as(String)
  page_name = env.params.json["pageName"].as(String)
  result = db.exec "INSERT INTO pages(section_id, type, name, user_id) VALUES(?, ?, ?, ?)", section_id, page_type, page_name, env.auth_id

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

get "/pages/:section_id" do |env|
  section_id = env.params.url["section_id"]

  pages = db.query_all("SELECT pages.id, pages.name, pages.type, pages.section_id, sections.notebook_id from pages JOIN sections ON sections.id = pages.section_id WHERE pages.section_id = ? AND pages.user_id = ?", section_id, env.auth_id, as: {
    id:   Int64,
    name: String,
    type: String,
    section_id: Int64,
    notebook_id: Int64
  })

  env.response.content_type = "application/json"
  pages.to_json
end

delete "/pages/:page_id" do |env|
  page_id = env.params.url["page_id"]

  page_uploads = db.query_all("SELECT file_path from page_uploads WHERE page_id = ? AND user_id = ?", page_id, env.auth_id, as: {
    file_path: String
  })

  page_uploads.each do |page_upload|
    file_path = ::File.join [Kemal.config.public_folder, page_upload["file_path"]]
    File.delete(file_path)
  end

  db.exec "DELETE FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/sections/:section_id" do |env|
  section_id = env.params.url["section_id"]

  # start delete file_uploads for pages
  pages = db.query_all("SELECT id from pages WHERE section_id = ? AND user_id = ?", section_id, env.auth_id, as: {
    id: Int64
  })

  pages.each do |page|
    page_uploads = db.query_all("SELECT file_path from page_uploads WHERE page_id = ? AND user_id = ?", page["id"], env.auth_id, as: {
      file_path: String
    })

    page_uploads.each do |page_upload|
      file_path = ::File.join [Kemal.config.public_folder, page_upload["file_path"]]
      File.delete(file_path)
    end
  end
  # end delete file_uploads for pages

  db.exec "DELETE FROM sections WHERE id = ? AND user_id = ?", section_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/notebooks/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  db.exec "DELETE FROM notebooks WHERE id = ? AND user_id = ?", notebook_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/pages/:page_id" do |env|
  page_id = env.params.url["page_id"]
  page_content = env.params.json["pageContent"].as(String)

  # save page history
  existing_content = db.scalar("SELECT content FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id).as(String | Nil)

  if existing_content && existing_content != page_content
    db.exec "INSERT INTO page_history(page_id, user_id, content) VALUES(?, ?, ?)", page_id, env.auth_id, existing_content
  end
  # end of save page history

  db.exec "UPDATE pages SET content=? WHERE id = ? AND user_id = ?", page_content, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

get "/pages/content/:page_id" do |env|
  page_id = env.params.url["page_id"]

  page = db.query_one("SELECT content from pages WHERE id = ? AND user_id = ?", page_id, env.auth_id, as: {content: Nil | String})

  env.response.content_type = "application/json"
  page.to_json
end

put "/pages/name/:page_id" do |env|
  page_id = env.params.url["page_id"]
  page_name = env.params.json["pageName"].as(String)

  db.exec "UPDATE pages SET name=? WHERE id = ? AND user_id = ?", page_name, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/sections/name/:section_id" do |env|
  section_id = env.params.url["section_id"]
  section_name = env.params.json["sectionName"].as(String)

  db.exec "UPDATE sections SET name=? WHERE id = ? AND user_id = ?", section_name, section_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/notebooks/name/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  notebook_name = env.params.json["notebookName"].as(String)

  db.exec "UPDATE notebooks SET name=? WHERE id = ? AND user_id = ?", notebook_name, notebook_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/notebooks/expanded/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  notebook_expanded = env.params.json["notebookExpanded"].as(Int64)

  db.exec "UPDATE notebooks SET expanded=? WHERE id = ? AND user_id = ?", notebook_expanded, notebook_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

post "/change-password" do |env|
  received_current_password = env.params.json["currentPassword"].as(String)
  new_password = env.params.json["newPassword"].as(String)

  hashed_current_password = db.scalar("SELECT password FROM users WHERE id = ?", env.auth_id).as(String)

  stored_password = Crypto::Bcrypt::Password.new(hashed_current_password)

  env.response.content_type = "application/json"

  if stored_password.verify(received_current_password)
    hashed_password = Crypto::Bcrypt::Password.create(new_password).to_s
    db.exec "UPDATE users SET password=? WHERE id = ?", hashed_password, env.auth_id

    {success: true}.to_json
  else
    {error: "Invalid Current Password"}.to_json
  end
end

post "/upload-image/:page_id" do|env|
  page_id = env.params.url["page_id"]

  found_page_for_user = db.scalar("SELECT id FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id).as(Int64 | Nil)

  env.response.content_type = "application/json"

  if found_page_for_user
    file = env.params.files["image"].tempfile

    FileUtils.mkdir_p(::File.join [Kemal.config.public_folder, "uploads/images/"])

    file_path = ::File.join [Kemal.config.public_folder, "uploads/images/", File.basename(file.path)]

    File.open(file_path, "w") do |f|
      IO.copy(file, f)
    end

    file_path_to_save = "uploads/images/" + File.basename(file.path)

    db.exec "INSERT INTO page_uploads(page_id, user_id, file_path) VALUES(?, ?, ?)", page_id, env.auth_id, file_path_to_save

    {imageUrl: file_path_to_save }.to_json
  else
    {error: "Auth error"}.to_json
  end
end
