require "./cache_helpers"

get "/" do
  "Journals API"
end

data_directory = "./data"

db = DB.open "sqlite3://#{data_directory}/store.db"
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

  user_version = db.scalar("PRAGMA user_version").as(Int64)

  if user_version === 0
    db.exec "ALTER TABLE pages ADD COLUMN sort_order INTEGER"
    db.exec "PRAGMA user_version = 1"
    user_version = 1
  end

  if user_version === 1
    db.exec "ALTER TABLE sections ADD COLUMN sort_order INTEGER"
    db.exec "PRAGMA user_version = 2"
    user_version = 2
  end

  if user_version === 2
    db.exec "ALTER TABLE pages ADD COLUMN font_size TEXT"
    db.exec "ALTER TABLE pages ADD COLUMN font_size_unit TEXT"
    db.exec "ALTER TABLE pages ADD COLUMN font TEXT"
    db.exec "PRAGMA user_version = 3"
    user_version = 3
  end

  if user_version === 3
    db.exec "ALTER TABLE pages ADD COLUMN view_only INTEGER DEFAULT 0"
    db.exec "PRAGMA user_version = 4"
    user_version = 4
  end

  if user_version === 4
    db.exec "
      CREATE TABLE IF NOT EXISTS profiles (
          id INTEGER,
          user_id INTEGER,
          name TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    "

    db.exec "ALTER TABLE notebooks ADD COLUMN profile_id INTEGER REFERENCES profiles(id)"

    db.exec "PRAGMA user_version = 5"

    user_version = 5
  end

  if user_version === 5
    db.exec "ALTER TABLE pages ADD COLUMN password TEXT"
    db.exec "PRAGMA user_version = 6"
    user_version = 6
  end

  if user_version === 6
    db.exec "ALTER TABLE pages ADD COLUMN parent_id INTEGER REFERENCES pages(id)"
    db.exec "PRAGMA user_version = 7"
    user_version = 7
  end

  "Installation Complete!"
end

get "/notebooks" do |env|
  profile_id = env.params.query["profile_id"]

  notebooksAsStructure = {
    id:       Int64,
    name:     String,
    expanded: Bool
  }

  if profile_id == "null"
    params = {env.auth_id}
    append_to_query = " AND profile_id IS NULL"
    notebooks = db.query_all("SELECT id, name, expanded from notebooks WHERE user_id = ?" + append_to_query, *params, as: notebooksAsStructure)
  else
    params = {env.auth_id, profile_id}
    append_to_query = " AND profile_id = ?"
    notebooks = db.query_all("SELECT id, name, expanded from notebooks WHERE user_id = ?" + append_to_query, *params, as: notebooksAsStructure)
  end

  hashed_notebooks = [] of Hash(String, Int64 | String | Bool | Array(NamedTuple(id: Int64, name: String, notebook_id: Int64, sort_order: Int64 | Nil)))

  notebooks.each do |notebook|
    hashed_notebooks << {
      "id"       => notebook["id"],
      "name"     => notebook["name"],
      "expanded" => notebook["expanded"],
      "sections" => db.query_all("SELECT id, name, notebook_id, sort_order from sections where notebook_id = ? ORDER BY CASE WHEN sort_order THEN 0 ELSE 1 END, sort_order", notebook["id"], as: {
        id:   Int64,
        name: String,
        notebook_id: Int64,
        sort_order: Int64 | Nil
      }),
    }
  end

  env.response.content_type = "application/json"
  hashed_notebooks.to_json
end

post "/notebooks" do |env|
  notebook_name = env.params.json["notebookName"].as(String)
  profile_id = env.params.json["profileId"].as(Int64 | Nil)
  result = db.exec "INSERT INTO notebooks(name, profile_id, user_id) VALUES(?, ?, ?)", notebook_name, profile_id, env.auth_id

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
  page_parent_id = env.params.json["pageParentId"].as(Int64 | Nil)

  result = db.exec "INSERT INTO pages(section_id, type, name, parent_id, user_id) VALUES(?, ?, ?, ?, ?)", section_id, page_type, page_name, page_parent_id, env.auth_id

  created_at = db.query_one("SELECT created_at FROM pages WHERE id = ?", result.last_insert_id, as: {
    created_at: String
  })["created_at"]

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id, createdAt: created_at}.to_json
end

get "/pages/:section_id" do |env|
  section_id = env.params.url["section_id"]
  page_groups_only = env.params.query.has_key?("page_groups_only") ? env.params.query["page_groups_only"] == "true" : false

  pages_groups_only_query = ""

  if page_groups_only
    pages_groups_only_query = " AND pages.type = 'PageGroup'"
  end

  pages = db.query_all("
    SELECT
      pages.id,
      pages.name,
      pages.type,
      pages.font_size,
      pages.font_size_unit,
      pages.font,
      pages.view_only,
      (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as password_exists,
      (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as locked,
      pages.sort_order,
      pages.section_id,
      pages.created_at,
      sections.notebook_id
    FROM pages
    JOIN sections ON sections.id = pages.section_id
    WHERE pages.section_id = ? AND pages.user_id = ? AND pages.parent_id IS NULL #{pages_groups_only_query}
    ORDER BY CASE WHEN pages.sort_order THEN 0 ELSE 1 END, pages.sort_order
  ", section_id, env.auth_id, as: {
    id:   Int64,
    name: String,
    type: String,
    font_size: String | Nil,
    font_size_unit: String | Nil,
    font: String | Nil,
    view_only: Bool,
    password_exists: Bool,
    locked: Bool,
    sort_order: Int64 | Nil,
    section_id: Int64,
    created_at: String,
    notebook_id: Int64
  })

  env.response.content_type = "application/json"
  pages.to_json
end

delete "/pages/:page_id" do |env|
  page_id = env.params.url["page_id"]

  child_pages = db.query_all("SELECT id from pages WHERE parent_id = ? AND user_id = ?", page_id, env.auth_id, as: {
    id: Int64
  })

  page_ids = child_pages.map { |item| item[:id] }

  page_ids << page_id.to_i

  args = [*page_ids, env.auth_id] of DB::Any

  page_id_placeholder = page_ids.map { "?" }.join(", ")

  page_uploads = db.query_all("SELECT file_path from page_uploads WHERE page_id IN (#{page_id_placeholder}) AND user_id = ?", args: args, as: {
    file_path: String
  })

  page_uploads.each do |page_upload|
    file_path = ::File.join [data_directory, page_upload["file_path"]]
    File.delete(file_path)
  end

  db.exec "DELETE FROM pages WHERE id IN (#{page_id_placeholder}) AND user_id = ?", args: args

  puts args.inspect

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
      file_path = ::File.join [data_directory, page_upload["file_path"]]
      File.delete(file_path)
    end
  end
  # end delete file_uploads for pages

  db.exec "DELETE FROM sections WHERE id = ? AND user_id = ?", section_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

def delete_notebook(db, data_directory, notebook_id, auth_id)
  # start delete file_uploads for pages
  sections = db.query_all("SELECT id from sections WHERE notebook_id = ? AND user_id = ?", notebook_id, auth_id, as: {
    id: Int64
  })

  sections.each do |section|
    pages = db.query_all("SELECT id from pages WHERE section_id = ? AND user_id = ?", section["id"], auth_id, as: {
      id: Int64
    })

    pages.each do |page|
      page_uploads = db.query_all("SELECT file_path from page_uploads WHERE page_id = ? AND user_id = ?", page["id"], auth_id, as: {
        file_path: String
      })

      page_uploads.each do |page_upload|
        file_path = ::File.join [data_directory, page_upload["file_path"]]
        File.delete(file_path)
      end
    end
  end
  # end delete file_uploads for pages

  db.exec "DELETE FROM notebooks WHERE id = ? AND user_id = ?", notebook_id, auth_id
end

delete "/notebooks/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]

  delete_notebook(db, data_directory, notebook_id, env.auth_id)

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

  ## limit history entries to 100
  db.exec "DELETE FROM page_history WHERE page_id = ? AND user_id = ? AND id NOT IN (
    SELECT id FROM page_history WHERE page_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  )", page_id, env.auth_id, page_id, env.auth_id
  # end of save page history

  db.exec "UPDATE pages SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", page_content, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

get "/pages/info/:page_id" do |env|
  page_id = env.params.url["page_id"]

  pageType = {
    parent_id: Int64 | Nil,
    parent_name: String | Nil,
    parent_view_only: Bool | Nil,
    id:   Int64,
    name: String,
    type: String,
    font_size: String | Nil,
    font_size_unit: String | Nil,
    font: String | Nil,
    view_only: Bool,
    password_exists: Bool,
    locked: Bool,
    created_at: String,
    section_id: Int64,
    notebook_id: Int64
  }

  begin
    page = db.query_one("
      SELECT
        pages.parent_id,
        page_group.name as parent_name,
        page_group.view_only as parent_view_only,
        pages.id,
        pages.name,
        pages.type,
        pages.font_size,
        pages.font_size_unit,
        pages.font,
        pages.view_only,
        (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as password_exists,
        (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as locked,
        pages.created_at,
        pages.section_id,
        sections.notebook_id
      FROM pages
      LEFT JOIN pages as page_group ON page_group.id = pages.parent_id
      JOIN sections ON sections.id = pages.section_id
      WHERE pages.id = ? AND pages.user_id = ?
    ", page_id, env.auth_id, as: pageType)
  rescue
    env.response.content_type = "application/json"
    env.response.status_code = 400
    env.response << {"error": "Invalid page id"}.to_json
    next
  end

  env.response.content_type = "application/json"
  page.to_json
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

  db.exec "UPDATE pages SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", page_name, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/pages/styles/:page_id" do |env|
  page_id = env.params.url["page_id"]

  font_size = env.params.json["fontSize"].as(String)
  font_size_unit = env.params.json["fontSizeUnit"].as(String)
  font = env.params.json["font"].as(String)

  db.exec "UPDATE pages SET font_size=?, font_size_unit=?, font=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", font_size, font_size_unit, font, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/pages/view-only/:page_id" do |env|
  page_id = env.params.url["page_id"]

  view_only = env.params.json["viewOnly"].as(Bool)

  if view_only
    view_only = 1
  else
    view_only = 0
  end

  db.exec "UPDATE pages SET view_only=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", view_only, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/pages/password-protect/:page_id" do |env|
  page_id = env.params.url["page_id"]

  password = env.params.json["password"].as(String)
  hashed_password = Crypto::Bcrypt::Password.create(password).to_s

  db.exec "UPDATE pages SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", hashed_password, page_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

post "/pages/unlock/:page_id" do |env|
  page_id = env.params.url["page_id"]

  password = env.params.json["password"].as(String)

  hashed_current_password = db.scalar("SELECT password FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id).as(String)
  stored_password = Crypto::Bcrypt::Password.new(hashed_current_password)

  env.response.content_type = "application/json"

  if stored_password.verify(password)
    {success: true}.to_json
  else
    {error: "Invalid Password"}.to_json
  end
end

put "/pages/change-password/:page_id" do |env|
  page_id = env.params.url["page_id"]

  current_password = env.params.json["currentPassword"].as(String)
  new_password = env.params.json["newPassword"].as(String)

  hashed_current_password = db.scalar("SELECT password FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id).as(String)
  stored_password = Crypto::Bcrypt::Password.new(hashed_current_password)

  env.response.content_type = "application/json"

  if stored_password.verify(current_password)
    hashed_new_password = Crypto::Bcrypt::Password.create(new_password).to_s
    db.exec "UPDATE pages SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", hashed_new_password, page_id, env.auth_id
    {success: true}.to_json
  else
    {error: "Invalid Password"}.to_json
  end
end

post "/pages/remove-password/:page_id" do |env|
  page_id = env.params.url["page_id"]

  password = env.params.json["password"].as(String)

  hashed_current_password = db.scalar("SELECT password FROM pages WHERE id = ? AND user_id = ?", page_id, env.auth_id).as(String)
  stored_password = Crypto::Bcrypt::Password.new(hashed_current_password)

  env.response.content_type = "application/json"

  if stored_password.verify(password)
    db.exec "UPDATE pages SET password=null, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", page_id, env.auth_id
    {success: true}.to_json
  else
    {error: "Invalid Password"}.to_json
  end
end

put "/sections/name/:section_id" do |env|
  section_id = env.params.url["section_id"]
  section_name = env.params.json["sectionName"].as(String)

  db.exec "UPDATE sections SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", section_name, section_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/notebooks/name/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  notebook_name = env.params.json["notebookName"].as(String)

  db.exec "UPDATE notebooks SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", notebook_name, notebook_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/notebooks/expanded/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  notebook_expanded = env.params.json["notebookExpanded"].as(Int64)

  db.exec "UPDATE notebooks SET expanded=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", notebook_expanded, notebook_id, env.auth_id

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
    db.exec "UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", hashed_password, env.auth_id

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
    filename = env.params.files["image"].filename
    if filename
    	file_extension = File.extname(filename)
    else
    	file_extension = ""
    end

    FileUtils.mkdir_p(::File.join [data_directory, "uploads/images/"])

    unix_timestamp = Time.utc.to_unix.to_s

    file_path = ::File.join [data_directory, "uploads/images/", unix_timestamp + "_" + File.basename(file.path) + file_extension]

    File.open(file_path, "w") do |f|
      IO.copy(file, f)
    end

    file_path_to_save = "uploads/images/" + unix_timestamp + "_" + File.basename(file.path) + file_extension

    db.exec "INSERT INTO page_uploads(page_id, user_id, file_path) VALUES(?, ?, ?)", page_id, env.auth_id, file_path_to_save

    {imageUrl: file_path_to_save }.to_json
  else
    {error: "Auth error"}.to_json
  end
end

get "/page-history/:page_id" do |env|
  page_id = env.params.url["page_id"]

  page_history = db.query_all("SELECT id, created_at FROM page_history WHERE page_id = ? AND user_id = ? ORDER BY created_at DESC", page_id, env.auth_id, as: {
    id:   Int64,
    created_at: String
  })

  env.response.content_type = "application/json"
  page_history.to_json
end

get "/page-history/content/:id" do |env|
  page_history_id = env.params.url["id"]

  page_history_content = db.scalar("SELECT content FROM page_history WHERE id = ? AND user_id = ?", page_history_id, env.auth_id).as(String | Nil)

  env.response.content_type = "application/json"
  {content: page_history_content}.to_json
end

post "/page-history/restore/:id" do |env|
  page_history_id = env.params.url["id"]

  page_history = db.query_one("SELECT page_id, content FROM page_history WHERE id = ? AND user_id = ?", page_history_id, env.auth_id, as: {
    page_id: Int64,
    content: String | Nil
  })

  # save page history
  existing_content = db.scalar("SELECT content FROM pages WHERE id = ? AND user_id = ?", page_history["page_id"], env.auth_id).as(String | Nil)

  if existing_content && existing_content != page_history["content"]
    db.exec "INSERT INTO page_history(page_id, user_id, content) VALUES(?, ?, ?)", page_history["page_id"], env.auth_id, existing_content
  end
  # end of save page history

  db.exec "UPDATE pages SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", page_history["content"], page_history["page_id"], env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

get "/page-uploads/:page_id" do |env|
  page_id = env.params.url["page_id"]

  page_uploads = db.query_all("SELECT id, file_path, created_at FROM page_uploads WHERE page_id = ? AND user_id = ? ORDER BY created_at DESC", page_id, env.auth_id, as: {
    id:   Int64,
    file_path: String,
    created_at: String
  })

  env.response.content_type = "application/json"
  page_uploads.to_json
end

delete "/page-uploads/delete/:id" do |env|
  id = env.params.url["id"]

  page_upload = db.query_one("SELECT file_path from page_uploads WHERE id = ? AND user_id = ?", id, env.auth_id, as: {
    file_path: String
  })

  puts page_upload["file_path"]
  file_path = ::File.join [data_directory, page_upload["file_path"]]
  File.delete(file_path)

  db.exec "DELETE FROM page_uploads WHERE id = ? AND user_id = ?", id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

require "json"

private class PageIdSortOrder
  include JSON::Serializable

  property pageId : String
  property sortOrder : Int32
end

post "/pages/sort-order/update" do |env|
  page_sort_orders = Array(PageIdSortOrder).from_json(env.params.json["_json"].to_json)

  page_sort_orders.each do |page_sort_order|
    db.exec "UPDATE pages SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", page_sort_order.sortOrder, page_sort_order.pageId, env.auth_id
  end

  env.response.content_type = "application/json"
  {success: true}.to_json
end

private class SectionIdSortOrder
  include JSON::Serializable

  property sectionId : Int32
  property sortOrder : Int32
end

post "/sections/sort-order/update" do |env|
  section_sort_orders = Array(SectionIdSortOrder).from_json(env.params.json["_json"].to_json)

  section_sort_orders.each do |section_sort_order|
    db.exec "UPDATE sections SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", section_sort_order.sortOrder, section_sort_order.sectionId, env.auth_id
  end

  env.response.content_type = "application/json"
  {success: true}.to_json
end

post "/duplicate-page/:page_id" do |env|
  page_id = env.params.url["page_id"]
  page_group_id = env.params.json["pageGroupId"].as(Int64 | Nil)

  result = db.exec "
    INSERT INTO pages(section_id, name, type, content, user_id, sort_order, font_size, font_size_unit, font, view_only, password, parent_id)
    SELECT section_id, name || ' (copy)' as name, type, content, user_id, -9999, font_size, font_size_unit, font, view_only, password, parent_id
    FROM pages
    WHERE id = ? AND user_id = ?
  ", page_id, env.auth_id

  if result.rows_affected == 0
    env.response.content_type = "application/json"
    {success: true}.to_json
  end

  original_page = db.query_one("SELECT id, section_id from pages WHERE id = ?", page_id, as: {
    id: Int64,
    section_id: Int64
  })

  pages_for_section = Nil

  if page_group_id
    pages_for_section = db.query_all("
      SELECT id FROM pages
      WHERE parent_id = ?
      ORDER BY CASE WHEN pages.sort_order THEN 0 ELSE 1 END, pages.sort_order
    ", page_group_id, as: {
      id: Int64
    })
  else
    pages_for_section = db.query_all("
      SELECT id FROM pages
      WHERE section_id = ?
      ORDER BY CASE WHEN pages.sort_order THEN 0 ELSE 1 END, pages.sort_order
    ", original_page["section_id"], as: {
      id: Int64
    })
  end

  original_page_index = pages_for_section.index { |page_for_section| page_for_section["id"] == original_page["id"] }
  duplicate_page_index = pages_for_section.index { |page_for_section| page_for_section["id"] == result.last_insert_id }

  if original_page_index && duplicate_page_index
    pages_for_section.insert(original_page_index, pages_for_section[duplicate_page_index])
    pages_for_section.delete_at(duplicate_page_index)

    pages_for_section.each_with_index do |page_for_section, index|
      db.exec "UPDATE pages SET sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", index + 1, page_for_section["id"]
    end
  end

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/move-page/:page_id" do |env|
  page_id = env.params.url["page_id"]
  target_section_id = env.params.json["sectionId"].as(Int64)
  target_page_group_id = env.params.json["pageGroupId"].as(Int64 | Nil)

  if target_page_group_id
    db.exec "UPDATE pages SET section_id=?, parent_id=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", target_section_id, target_page_group_id, page_id, env.auth_id
  else
    db.exec "UPDATE pages SET section_id=?, parent_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", target_section_id, page_id, env.auth_id
  end

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/move-section/:section_id" do |env|
  section_id = env.params.url["section_id"]
  target_notebook_id = env.params.json["notebookId"].as(Int64)

  db.exec "UPDATE sections SET notebook_id=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", target_notebook_id, section_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

put "/move-notebook/:notebook_id" do |env|
  notebook_id = env.params.url["notebook_id"]
  target_profile_id = env.params.json["profileId"].as(Int64|Nil)

  db.exec "UPDATE notebooks SET profile_id=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", target_profile_id, notebook_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

get "/profiles" do |env|
  profiles = db.query_all("SELECT id, name FROM profiles WHERE user_id = ? ORDER BY created_at ASC", env.auth_id, as: {
    id:   Int64 | Nil,
    name: String
  })

  profiles.insert(0, {id: nil, name: "Default"})

  env.response.content_type = "application/json"
  profiles.to_json
end

post "/profiles" do |env|
  profile_name = env.params.json["profileName"].as(String)
  result = db.exec "INSERT INTO profiles(name, user_id) VALUES(?, ?)", profile_name, env.auth_id

  env.response.content_type = "application/json"
  {insertedRowId: result.last_insert_id}.to_json
end

put "/profiles/name/:profile_id" do |env|
  profile_id = env.params.url["profile_id"]
  profile_name = env.params.json["profileName"].as(String)

  db.exec "UPDATE profiles SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", profile_name, profile_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/profiles/delete/:profile_id" do |env|
  profile_id = env.params.url["profile_id"]

  notebooks = db.query_all("SELECT id from notebooks WHERE profile_id = ? AND user_id = ?", profile_id, env.auth_id, as: {
    id: Int64
  })

  notebooks.each do |notebook|
    delete_notebook(db, data_directory, notebook["id"], env.auth_id)
  end

  db.exec "DELETE FROM profiles WHERE id = ? AND user_id = ?", profile_id, env.auth_id

  env.response.content_type = "application/json"
  {success: true}.to_json
end

get "/page-group/:page_id" do |env|
  page_id = env.params.url["page_id"]

  pages = db.query_all("
    SELECT
      pages.parent_id,
      pages.id,
      pages.name,
      pages.type,
      pages.font_size,
      pages.font_size_unit,
      pages.font,
      pages.view_only,
      (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as password_exists,
      (CASE WHEN pages.password IS NOT NULL THEN true ELSE false END) as locked,
      pages.sort_order,
      pages.section_id,
      pages.created_at,
      sections.notebook_id
    FROM pages
    JOIN sections ON sections.id = pages.section_id
    WHERE pages.parent_id = ? AND pages.user_id = ?
    ORDER BY CASE WHEN pages.sort_order THEN 0 ELSE 1 END, pages.sort_order
  ", page_id, env.auth_id, as: {
    parent_id: Int64,
    id:   Int64,
    name: String,
    type: String,
    font_size: String | Nil,
    font_size_unit: String | Nil,
    font: String | Nil,
    view_only: Bool,
    password_exists: Bool,
    locked: Bool,
    sort_order: Int64 | Nil,
    section_id: Int64,
    created_at: String,
    notebook_id: Int64
  })

  env.response.content_type = "application/json"
  pages.to_json
end

error 404 do
  "404: The page you're looking for doesn't exist"
end

get "/uploads/images/:file_name" do |env|
  file_name = env.params.url["file_name"]

  file_path = "#{data_directory}/uploads/images/#{file_name}"

  if File.exists?(file_path)
    begin
      env.response.content_type = MIME.from_filename(file_name)
    rescue exception
      env.response.content_type = "application/octet-stream"
    end

    # add caching to speed up loading of uploaded images / files
    last_modified = modification_time(file_path)
    add_cache_headers(env.response.headers, last_modified)

    if cache_request?(env, last_modified)
      env.response.status_code = 304
    else
      File.read(file_path)
    end
  else
    env.response.status_code = 404
  end
end

post "/pages/search" do |env|
  query = env.params.json["query"].as(String)

  pages = db.query_all("
    SELECT
      pages.id,
      CASE WHEN pages.parent_id IS NOT NULL THEN page_group.name || ' > ' || pages.name ELSE pages.name END as name,
      pages.section_id,
      sections.notebook_id,
      sections.name as section_name,
      notebooks.name as notebook_name,
      notebooks.profile_id
    FROM pages
    JOIN sections ON sections.id = pages.section_id
    JOIN notebooks ON notebooks.id = sections.notebook_id
    LEFT JOIN pages AS page_group ON page_group.id = pages.parent_id
    WHERE pages.user_id = ?
    AND CASE WHEN pages.parent_id IS NOT NULL THEN page_group.name || ' > ' || pages.name ELSE pages.name END LIKE ?
    ORDER BY name
    LIMIT 10
  ", env.auth_id, "%#{query}%", as: {
    id: Int64,
    name: String,
    section_id: Int64,
    notebook_id: Int64,
    section_name: String,
    notebook_name: String,
    profile_id: Int64 | Nil
  })

  env.response.content_type = "application/json"
  pages.to_json
end
