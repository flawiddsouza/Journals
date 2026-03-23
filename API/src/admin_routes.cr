def require_admin(env)
  if env.auth_role != "admin"
    env.response.content_type = "application/json"
    env.response.status_code = 403
    env.response << {error: "Forbidden"}.to_json
    false
  else
    true
  end
end

get "/admin/users/list" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"
  users = db.query_all("SELECT id, username FROM users ORDER BY username", as: {id: Int64, username: String})
  users.to_json
end

get "/admin/users" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  page     = (env.params.query["page"]? || "1").to_i
  per_page = 50
  offset   = (page - 1) * per_page

  total       = db.scalar("SELECT COUNT(*) FROM users").as(Int64)
  total_pages = (total / per_page.to_f).ceil.to_i

  users = db.query_all("
    SELECT
      u.id, u.username, u.role, u.created_at, u.last_seen_at,
      (SELECT COUNT(*) FROM pages WHERE user_id = u.id AND deleted_at IS NULL) as page_count,
      (SELECT COUNT(*) FROM notebooks WHERE user_id = u.id AND deleted_at IS NULL) as notebook_count,
      (SELECT COUNT(*) FROM page_history WHERE user_id = u.id) as edit_count
    FROM users u
    ORDER BY u.last_seen_at DESC NULLS LAST
    LIMIT ? OFFSET ?
  ", per_page, offset, as: {
    id: Int64, username: String, role: String,
    created_at: String, last_seen_at: String | Nil,
    page_count: Int64, notebook_count: Int64, edit_count: Int64
  })

  {
    users:        users,
    current_page: page,
    total_pages:  total_pages,
    total_count:  total,
  }.to_json
end

post "/admin/users" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  username = env.params.json["username"]?.try(&.as(String))
  password = env.params.json["password"]?.try(&.as(String))
  role     = env.params.json["role"]?.try(&.as(String))

  unless username && password && role
    env.response.status_code = 422
    next env.response << {error: "username, password, and role are required"}.to_json
  end

  unless ["admin", "user"].includes?(role)
    env.response.status_code = 422
    next env.response << {error: "role must be 'admin' or 'user'"}.to_json
  end

  unless password.size >= 6
    env.response.status_code = 422
    next env.response << {error: "password must be at least 6 characters"}.to_json
  end

  existing = db.query_one?("SELECT id FROM users WHERE username = ?", username, as: {id: Int64})
  if existing
    env.response.status_code = 409
    next env.response << {error: "User already exists"}.to_json
  end

  hashed = Crypto::Bcrypt::Password.create(password).to_s
  db.exec "INSERT INTO users(username, password, role) VALUES(?, ?, ?)", username, hashed, role
  {success: true}.to_json
end

delete "/admin/users/:id" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  target_id = env.params.url["id"].to_i64

  if target_id == env.auth_id
    env.response.status_code = 403
    next env.response << {error: "Cannot delete your own account"}.to_json
  end

  target_role = db.scalar("SELECT role FROM users WHERE id = ?", target_id).as(String?)
  admin_count = db.scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ?", target_id).as(Int64)
  if target_role == "admin" && admin_count < 1
    env.response.status_code = 409
    next env.response << {error: "Cannot delete the last admin"}.to_json
  end

  # Delete uploaded files from disk before cascade removes the DB records
  uploads = db.query_all("SELECT file_path FROM page_uploads WHERE user_id = ?", target_id, as: {file_path: String})
  uploads.each do |row|
    path = File.join(data_directory, row[:file_path])
    File.delete(path) if File.exists?(path)
  end

  db.exec "DELETE FROM users WHERE id = ?", target_id
  {success: true}.to_json
end

put "/admin/users/:id/password" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  target_id = env.params.url["id"].to_i64
  password  = env.params.json["password"]?.try(&.as(String))

  unless password && password.size >= 6
    env.response.status_code = 422
    next env.response << {error: "password must be at least 6 characters"}.to_json
  end

  hashed = Crypto::Bcrypt::Password.create(password).to_s
  db.exec "UPDATE users SET password = ? WHERE id = ?", hashed, target_id
  {success: true}.to_json
end

put "/admin/users/:id/role" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  target_id = env.params.url["id"].to_i64
  role      = env.params.json["role"]?.try(&.as(String))

  unless role && ["admin", "user"].includes?(role)
    env.response.status_code = 422
    next env.response << {error: "role must be 'admin' or 'user'"}.to_json
  end

  if target_id == env.auth_id
    env.response.status_code = 403
    next env.response << {error: "Cannot change your own role"}.to_json
  end

  if role == "user"
    remaining_admins = db.scalar("SELECT COUNT(*) FROM users WHERE role = 'admin' AND id != ?", target_id).as(Int64)
    if remaining_admins < 1
      env.response.status_code = 409
      next env.response << {error: "Cannot demote the last admin"}.to_json
    end
  end

  db.exec "UPDATE users SET role = ? WHERE id = ?", role, target_id
  {success: true}.to_json
end

get "/admin/analytics" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  total_users     = db.scalar("SELECT COUNT(*) FROM users").as(Int64)
  admin_count     = db.scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'").as(Int64)
  total_pages     = db.scalar("SELECT COUNT(*) FROM pages WHERE deleted_at IS NULL").as(Int64)
  total_notebooks = db.scalar("SELECT COUNT(*) FROM notebooks WHERE deleted_at IS NULL").as(Int64)
  total_sections  = db.scalar("SELECT COUNT(*) FROM sections WHERE deleted_at IS NULL").as(Int64)
  total_edits     = db.scalar("SELECT COUNT(*) FROM page_history").as(Int64)

  pages_per_day = db.query_all("
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM pages
    WHERE created_at >= DATE('now', '-30 days') AND deleted_at IS NULL
    GROUP BY day ORDER BY day
  ", as: {day: String, count: Int64})

  type_dist = db.query_all("
    SELECT type, COUNT(*) as count FROM pages
    WHERE deleted_at IS NULL GROUP BY type ORDER BY count DESC
  ", as: {type: String, count: Int64})

  users = db.query_all("
    SELECT
      u.id, u.username, u.role, u.created_at, u.last_seen_at,
      (SELECT COUNT(*) FROM pages WHERE user_id = u.id AND deleted_at IS NULL) as page_count,
      (SELECT COUNT(*) FROM notebooks WHERE user_id = u.id AND deleted_at IS NULL) as notebook_count,
      (SELECT COUNT(*) FROM sections WHERE user_id = u.id AND deleted_at IS NULL) as section_count,
      (SELECT COUNT(*) FROM page_history WHERE user_id = u.id) as edit_count,
      (SELECT COUNT(*) FROM page_uploads WHERE user_id = u.id) as upload_count
    FROM users u
    ORDER BY u.last_seen_at DESC NULLS LAST
  ", as: {
    id: Int64, username: String, role: String,
    created_at: String, last_seen_at: String | Nil,
    page_count: Int64, notebook_count: Int64, section_count: Int64,
    edit_count: Int64, upload_count: Int64
  })

  data_dir = data_directory
  users_with_storage = users.map do |u|
    uploads = db.query_all("SELECT file_path FROM page_uploads WHERE user_id = ?", u[:id], as: {file_path: String})
    storage_bytes = uploads.sum(0_i64) do |row|
      path = File.join(data_dir, row[:file_path])
      File.exists?(path) ? File.size(path).to_i64 : 0_i64
    end
    {
      id: u[:id], username: u[:username], role: u[:role],
      created_at: u[:created_at], last_seen_at: u[:last_seen_at],
      page_count: u[:page_count], notebook_count: u[:notebook_count],
      section_count: u[:section_count], edit_count: u[:edit_count],
      upload_count: u[:upload_count], storage_bytes: storage_bytes
    }
  end

  total_storage = users_with_storage.sum(0_i64, &.[:storage_bytes])

  {
    total_users:         total_users,
    admin_count:         admin_count,
    user_count:          total_users - admin_count,
    total_pages:         total_pages,
    total_notebooks:     total_notebooks,
    total_sections:      total_sections,
    total_edits:         total_edits,
    total_storage_bytes: total_storage,
    pages_per_day:       pages_per_day,
    type_distribution:   type_dist,
    users:               users_with_storage,
  }.to_json
end

get "/admin/activity" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  page     = (env.params.query["page"]? || "1").to_i
  user_id  = env.params.query["user_id"]?
  per_page = 50
  offset   = (page - 1) * per_page

  uid = user_id && !user_id.empty? ? user_id.to_i64 : nil

  total = if uid
    db.scalar("SELECT COUNT(*) FROM activity_log WHERE user_id = ?", uid).as(Int64)
  else
    db.scalar("SELECT COUNT(*) FROM activity_log").as(Int64)
  end
  total_pages = (total / per_page.to_f).ceil.to_i

  entries = if uid
    db.query_all("
      SELECT a.id, a.user_id, u.username, a.action, a.created_at
      FROM activity_log a
      JOIN users u ON u.id = a.user_id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    ", uid, per_page, offset, as: {
      id: Int64, user_id: Int64, username: String, action: String, created_at: String
    })
  else
    db.query_all("
      SELECT a.id, a.user_id, u.username, a.action, a.created_at
      FROM activity_log a
      JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    ", per_page, offset, as: {
      id: Int64, user_id: Int64, username: String, action: String, created_at: String
    })
  end

  {
    entries:      entries,
    current_page: page,
    total_pages:  total_pages,
    total_count:  total,
  }.to_json
end

get "/admin/settings" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"
  settings = db.query_all("SELECT key, value FROM app_settings", as: {key: String, value: String})
  settings.to_json
end

put "/admin/settings" do |env|
  next unless require_admin(env)
  env.response.content_type = "application/json"

  key   = env.params.json["key"]?.try(&.as(String))
  value = env.params.json["value"]?.try(&.as(String))

  unless key && value && ["allow_registration", "activity_logging"].includes?(key)
    env.response.status_code = 422
    next env.response << {error: "invalid key"}.to_json
  end

  db.exec "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", key, value
  {success: true}.to_json
end
