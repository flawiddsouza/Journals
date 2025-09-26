class MiniAppPageNotFoundError < Exception; end
class MiniAppPageTypeError < Exception; end

# Helper: update page content and save history (last 100)
def update_page_content_with_history(db, page_id : Int64, auth_id : Int64, new_content : String)
  existing_row = db.query_one?("SELECT content FROM pages WHERE id = ? AND user_id = ?", page_id, auth_id, as: {content: String | Nil})
  existing_content = existing_row ? existing_row["content"]? : nil
  if existing_content && existing_content != new_content
    db.exec "INSERT INTO page_history(page_id, user_id, content) VALUES(?, ?, ?)", page_id, auth_id, existing_content
    db.exec "DELETE FROM page_history WHERE page_id = ? AND user_id = ? AND id NOT IN (\n      SELECT id FROM page_history WHERE page_id = ? AND user_id = ?\n      ORDER BY created_at DESC\n      LIMIT 100\n    )", page_id, auth_id, page_id, auth_id
  end
  db.exec "UPDATE pages SET content=?, updated_at=CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", new_content, page_id, auth_id
end

# Helper: sanitize MiniApp content by removing any kv (data). Accepts JSON string; returns JSON string
def sanitize_miniapp_content(raw : String?) : String
  return {files: nil, kv: nil}.to_json if raw.nil?
  begin
    parsed = JSON.parse(raw)
    files = parsed["files"]?
    # Persist only files (html/css/js/modules); drop kv
    {files: files, kv: JSON::Any.new(nil)}.to_json
  rescue
    {files: nil, kv: nil}.to_json
  end
end

def sanitized_miniapp_content!(db, page_id : Int64, auth_id : Int64) : String
  page = db.query_one?("SELECT type, content FROM pages WHERE id = ? AND user_id = ?", page_id, auth_id, as: {type: String, content: String | Nil})
  raise MiniAppPageNotFoundError.new unless page
  if page["type"] != "MiniApp"
    raise MiniAppPageTypeError.new
  end
  sanitize_miniapp_content(page["content"]?)
end

def upsert_page_template_link(db, page_id : Int64, template_id : Int64, revision_number : Int64)
  existing_link = db.query_one?("SELECT id FROM page_template_links WHERE page_id = ?", page_id, as: {id: Int64})
  if existing_link
    db.exec "UPDATE page_template_links SET template_id=?, last_revision_number=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", template_id, revision_number, existing_link["id"]
  else
    db.exec "INSERT INTO page_template_links(page_id, template_id, last_revision_number) VALUES(?, ?, ?)", page_id, template_id, revision_number
  end
end

# Create a new template from a MiniApp page
post "/miniapp/templates" do |env|
  name = env.params.json["name"].as(String)
  description = env.params.json["description"]?.try &.as(String) || ""
  is_public = env.params.json["isPublic"]?.try &.as(Bool) || false
  page_id_param = env.params.json["pageId"]?.try &.as(Int64)
  if page_id_param.nil?
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "pageId is required"}.to_json
    next
  end
  page_id = page_id_param.not_nil!

  begin
    content = sanitized_miniapp_content!(db, page_id, env.auth_id)
  rescue MiniAppPageNotFoundError
    env.response.status_code = 404
    env.response.content_type = "application/json"
    env.response << {error: "Page not found"}.to_json
    next
  rescue MiniAppPageTypeError
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "Page is not a MiniApp"}.to_json
    next
  end

  pub_flag = is_public ? 1 : 0
  result = db.exec "INSERT INTO mini_app_templates(user_id, name, description, is_public, revision_counter) VALUES(?, ?, ?, ?, 0)", env.auth_id, name, description, pub_flag
  template_id = result.last_insert_id.to_i64

  # Create initial revision 1
  db.exec "INSERT INTO mini_app_template_revisions(template_id, revision_number, content) VALUES(?, ?, ?)", template_id, 1, content
  db.exec "UPDATE mini_app_templates SET revision_counter = 1, updated_at=CURRENT_TIMESTAMP WHERE id = ?", template_id
  upsert_page_template_link(db, page_id, template_id, 1_i64)

  env.response.content_type = "application/json"
  {insertedRowId: template_id}.to_json
end

# List templates with tabs and sorts
get "/miniapp/templates" do |env|
  tab = env.params.query["tab"]? || "starred" # starred | all | yours
  sort = env.params.query["sort"]? || "stars"  # stars | alpha

  listing_schema = {
    id: Int64,
    name: String,
    description: String | Nil,
    is_public: Bool,
    owner_id: Int64,
    stars: Int64,
    revision_counter: Int64,
    created_at: String,
    updated_at: String
  }

  base_select = "
    SELECT t.id, t.name, t.description, (CASE WHEN t.is_public = 1 THEN 1 ELSE 0 END) as is_public,
           t.user_id as owner_id,
           (SELECT COUNT(*) FROM mini_app_stars s WHERE s.template_id = t.id) as stars,
           t.revision_counter, t.created_at, t.updated_at
    FROM mini_app_templates t
  "

  sql = base_select.dup
  args = [] of DB::Any

  base_order = sort == "alpha" ? "LOWER(t.name) ASC" : "stars DESC, LOWER(t.name) ASC"

  case tab
  when "starred"
    sql += "
      JOIN mini_app_stars s ON s.template_id = t.id AND s.user_id = ?
    "
    args << env.auth_id
  when "yours"
    sql += "
      WHERE t.user_id = ?
    "
    args << env.auth_id
  else
    sql += "
      WHERE t.is_public = 1
    "
  end

  sql += "
    ORDER BY #{base_order}
  "

  rows = db.query_all(sql, args: args, as: listing_schema)
  env.response.content_type = "application/json"
  rows.to_json
end

# Get template detail (meta + latest revision number + starred by current user)
get "/miniapp/templates/:id" do |env|
  id = env.params.url["id"]
  begin
    row = db.query_one(
      "
        SELECT t.id, t.name, t.description, (CASE WHEN t.is_public = 1 THEN 1 ELSE 0 END) as is_public,
               t.user_id as owner_id,
               (SELECT COUNT(*) FROM mini_app_stars s WHERE s.template_id = t.id) as stars,
               t.revision_counter, t.created_at, t.updated_at,
               (CASE WHEN EXISTS(SELECT 1 FROM mini_app_stars s WHERE s.template_id = t.id AND s.user_id = ?) THEN 1 ELSE 0 END) as starred
        FROM mini_app_templates t
        WHERE t.id = ?
      ",
      env.auth_id,
      id,
      as: {
        id: Int64,
        name: String,
        description: String | Nil,
        is_public: Bool,
        owner_id: Int64,
        stars: Int64,
        revision_counter: Int64,
        created_at: String,
        updated_at: String,
        starred: Bool
      }
    )
    # Restrict private templates to owner
    if row["is_public"] == false && row["owner_id"] != env.auth_id
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Forbidden"}.to_json
    else
      env.response.content_type = "application/json"
      row.to_json
    end
  rescue
    env.response.status_code = 404
    env.response.content_type = "application/json"
    {error: "Not found"}.to_json
  end
end

# Update template meta: name, description, isPublic (only owner)
put "/miniapp/templates/:id" do |env|
  id = env.params.url["id"].to_i64
  name = env.params.json["name"]?.try &.as(String)
  description = env.params.json["description"]?.try &.as(String)
  is_public = env.params.json["isPublic"]?.try &.as(Bool)

  owner = db.scalar("SELECT user_id FROM mini_app_templates WHERE id = ?", id).as(Int64 | Nil)
  if owner.nil? || owner != env.auth_id
    env.response.status_code = 403
    env.response.content_type = "application/json"
    {error: "Forbidden"}.to_json
  else
    sets = [] of String
    args = [] of DB::Any
    if name
      sets << "name=?"
      args << name
    end
    if description
      sets << "description=?"
      args << description
    end
    if !is_public.nil?
      sets << "is_public=?"
      args << (is_public ? 1 : 0)
    end
    if sets.size > 0
      sql = "UPDATE mini_app_templates SET #{sets.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id = ?"
      args << id
      db.exec sql, args: args
    end
    env.response.content_type = "application/json"
    {success: true}.to_json
  end
end

delete "/miniapp/templates/:id" do |env|
  id = env.params.url["id"].to_i64
  owner = db.scalar("SELECT user_id FROM mini_app_templates WHERE id = ?", id).as(Int64 | Nil)
  if owner.nil? || owner != env.auth_id
    env.response.status_code = 403
    env.response.content_type = "application/json"
    {error: "Forbidden"}.to_json
  else
    db.exec "DELETE FROM mini_app_templates WHERE id = ?", id
    env.response.content_type = "application/json"
    {success: true}.to_json
  end
end

# Star / Unstar template
post "/miniapp/templates/:id/star" do |env|
  id = env.params.url["id"].to_i64
  begin
    t = db.query_one("SELECT user_id, is_public FROM mini_app_templates WHERE id = ?", id, as: {user_id: Int64, is_public: Int64})
    if t["user_id"] != env.auth_id && t["is_public"] == 0
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Cannot star a private template"}.to_json
      next
    end
    db.exec "INSERT OR IGNORE INTO mini_app_stars(template_id, user_id) VALUES(?, ?)", id, env.auth_id
    env.response.content_type = "application/json"
    {success: true}.to_json
  rescue
    env.response.status_code = 400
    env.response.content_type = "application/json"
    {error: "Unable to star"}.to_json
  end
end

delete "/miniapp/templates/:id/star" do |env|
  id = env.params.url["id"].to_i64
  db.exec "DELETE FROM mini_app_stars WHERE template_id = ? AND user_id = ?", id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

# Add a new revision from a page
post "/miniapp/templates/:id/revisions" do |env|
  id = env.params.url["id"].to_i64
  owner = db.scalar("SELECT user_id FROM mini_app_templates WHERE id = ?", id).as(Int64 | Nil)
  if owner.nil? || owner != env.auth_id
    env.response.status_code = 403
    env.response.content_type = "application/json"
    {error: "Forbidden"}.to_json
    next
  end

  page_id_param = env.params.json["pageId"]?.try &.as(Int64)
  if page_id_param.nil?
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "pageId is required"}.to_json
    next
  end
  page_id = page_id_param.not_nil!

  begin
    content = sanitized_miniapp_content!(db, page_id, env.auth_id)
  rescue MiniAppPageNotFoundError
    env.response.status_code = 404
    env.response.content_type = "application/json"
    env.response << {error: "Page not found"}.to_json
    next
  rescue MiniAppPageTypeError
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "Page is not a MiniApp"}.to_json
    next
  end

  rev_no = db.scalar("SELECT revision_counter FROM mini_app_templates WHERE id = ?", id).as(Int64)
  new_rev = (rev_no + 1).to_i
  db.exec "INSERT INTO mini_app_template_revisions(template_id, revision_number, content) VALUES(?, ?, ?)", id, new_rev, content
  db.exec "UPDATE mini_app_templates SET revision_counter = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", new_rev, id
  upsert_page_template_link(db, page_id, id, new_rev.to_i64)

  env.response.content_type = "application/json"
  {revisionNumber: new_rev}.to_json
end

get "/miniapp/templates/:id/revisions" do |env|
  id = env.params.url["id"].to_i64
  begin
    access = db.query_one("SELECT user_id, is_public FROM mini_app_templates WHERE id = ?", id, as: {user_id: Int64, is_public: Int64})
    if access["user_id"] != env.auth_id && access["is_public"] == 0
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Forbidden"}.to_json
      next
    end
  rescue
    env.response.status_code = 404
    env.response.content_type = "application/json"
    {error: "Not found"}.to_json
    next
  end
  rows = db.query_all("SELECT id, revision_number, created_at FROM mini_app_template_revisions WHERE template_id = ? ORDER BY revision_number DESC", id, as: {id: Int64, revision_number: Int64, created_at: String})
  env.response.content_type = "application/json"
  rows.to_json
end

get "/miniapp/templates/:id/revisions/:rev" do |env|
  id = env.params.url["id"].to_i64
  rev = env.params.url["rev"].to_i64
  begin
    access = db.query_one("SELECT user_id, is_public FROM mini_app_templates WHERE id = ?", id, as: {user_id: Int64, is_public: Int64})
    if access["user_id"] != env.auth_id && access["is_public"] == 0
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Forbidden"}.to_json
      next
    end
    current = db.query_one("SELECT content, revision_number FROM mini_app_template_revisions WHERE template_id = ? AND revision_number = ?", id, rev, as: {content: String | Nil, revision_number: Int64})
    prev = db.query_one?("SELECT content, revision_number FROM mini_app_template_revisions WHERE template_id = ? AND revision_number = ?", id, rev - 1, as: {content: String | Nil, revision_number: Int64})
    env.response.content_type = "application/json"
    {current: current["content"], previous: prev ? prev["content"] : nil}.to_json
  rescue
    env.response.status_code = 404
    env.response.content_type = "application/json"
    {error: "Not found"}.to_json
  end
end

# Apply a template (latest or specific revision) to a page and record link
post "/miniapp/templates/:id/apply-to-page" do |env|
  id = env.params.url["id"].to_i64
  page_id = env.params.json["pageId"].as(Int64 | Int32).to_i64
  revision_param = env.params.json["revision"]?.try &.as(Int64 | Int32)
  requested_revision = revision_param.try &.to_i64

  # Ensure page belongs to user and is MiniApp
  begin
    page_full = db.query_one?("SELECT user_id, type FROM pages WHERE id = ?", page_id, as: {user_id: Int64, type: String})
    if page_full.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      env.response << {error: "Page not found"}.to_json
      next
    end
    if page_full.not_nil!["user_id"] != env.auth_id
      env.response.status_code = 403
      env.response.content_type = "application/json"
      env.response << {error: "Forbidden (not your page)"}.to_json
      next
    end
    if page_full.not_nil!["type"] != "MiniApp"
      env.response.status_code = 400
      env.response.content_type = "application/json"
      env.response << {error: "Target page is not MiniApp"}.to_json
      next
    end
  rescue
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "Invalid request"}.to_json
    next
  end

  # Access check: template must be public or owned by user, and target revision must exist
  trow = db.query_one?("SELECT user_id, is_public, revision_counter FROM mini_app_templates WHERE id = ?", id, as: {user_id: Int64, is_public: Int64, revision_counter: Int64})
  if trow.nil?
    env.response.status_code = 404
    env.response.content_type = "application/json"
    env.response << {error: "Template not found"}.to_json
    next
  end
  if trow.not_nil!["user_id"] != env.auth_id && trow.not_nil!["is_public"] == 0
    env.response.status_code = 403
    env.response.content_type = "application/json"
    env.response << {error: "Template is private"}.to_json
    next
  end
  latest_rev = trow.not_nil!["revision_counter"].to_i64
  target_rev = requested_revision || latest_rev
  if target_rev < 1
    env.response.status_code = 400
    env.response.content_type = "application/json"
    env.response << {error: "No revisions to apply"}.to_json
    next
  end

  rev = db.query_one?("SELECT content FROM mini_app_template_revisions WHERE template_id = ? AND revision_number = ?", id, target_rev, as: {content: String | Nil})
  if rev.nil?
    env.response.status_code = 404
    env.response.content_type = "application/json"
    env.response << {error: "Revision not found"}.to_json
    next
  end
  content = rev.not_nil!["content"]? || {files: nil, kv: nil}.to_json

  # Update page content and link (with history)
  update_page_content_with_history(db, page_id, env.auth_id, content)

  # Upsert page link
  existing_link = db.query_one?("SELECT id FROM page_template_links WHERE page_id = ?", page_id, as: {id: Int64})
  if existing_link
    db.exec "UPDATE page_template_links SET template_id=?, last_revision_number=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", id, target_rev, existing_link["id"]
  else
    db.exec "INSERT INTO page_template_links(page_id, template_id, last_revision_number) VALUES(?, ?, ?)", page_id, id, target_rev
  end

  env.response.content_type = "application/json"
  {success: true, revisionNumber: target_rev}.to_json
end

# Fetch link info for a page (template id and versions)
get "/miniapp/pages/:page_id/template" do |env|
  page_id = env.params.url["page_id"].to_i64
  begin
    page_owner = db.query_one?("SELECT user_id FROM pages WHERE id = ?", page_id, as: {user_id: Int64})
    if page_owner.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      {error: "Page not found"}.to_json
      next
    end
    if page_owner.not_nil!["user_id"] != env.auth_id
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Forbidden"}.to_json
      next
    end

    link = db.query_one?("SELECT template_id, last_revision_number FROM page_template_links WHERE page_id = ?", page_id, as: {template_id: Int64, last_revision_number: Int64})
    if link
      t = db.query_one("SELECT name, revision_counter, is_public, user_id FROM mini_app_templates WHERE id = ?", link["template_id"], as: {name: String, revision_counter: Int64, is_public: Int64, user_id: Int64})
      env.response.content_type = "application/json"
      {templateId: link["template_id"], templateName: t["name"], lastPulledRevision: link["last_revision_number"], latestRevision: t["revision_counter"]}.to_json
    else
      env.response.content_type = "application/json"
      {templateId: nil}.to_json
    end
  rescue
    env.response.status_code = 404
    env.response.content_type = "application/json"
    {error: "Not found"}.to_json
  end
end

# Pull latest (or specific) revision into a page (must have link)
post "/miniapp/pages/:page_id/pull" do |env|
  page_id = env.params.url["page_id"].to_i64
  revision_param = env.params.json["revision"]?.try &.as(Int64 | Int32)
  target_rev = revision_param.try &.to_i64
  begin
    page_owner = db.query_one?("SELECT user_id, type FROM pages WHERE id = ?", page_id, as: {user_id: Int64, type: String})
    if page_owner.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      {error: "Page not found"}.to_json
      next
    end
    if page_owner.not_nil!["user_id"] != env.auth_id
      env.response.status_code = 403
      env.response.content_type = "application/json"
      {error: "Forbidden (not your page)"}.to_json
      next
    end
    if page_owner.not_nil!["type"] != "MiniApp"
      env.response.status_code = 400
      env.response.content_type = "application/json"
      {error: "Target page is not MiniApp"}.to_json
      next
    end

    link = db.query_one?("SELECT template_id FROM page_template_links WHERE page_id = ?", page_id, as: {template_id: Int64})
    if link.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      {error: "No template link for page"}.to_json
      next
    end
    template_id = link.not_nil!["template_id"]
    trow = db.query_one?("SELECT revision_counter FROM mini_app_templates WHERE id = ?", template_id, as: {revision_counter: Int64})
    if trow.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      {error: "Template not found"}.to_json
      next
    end
    latest_rev = trow.not_nil!["revision_counter"].to_i64
    rev_to_pull = target_rev || latest_rev
    rev = db.query_one?("SELECT content FROM mini_app_template_revisions WHERE template_id = ? AND revision_number = ?", template_id, rev_to_pull, as: {content: String | Nil})
    if rev.nil?
      env.response.status_code = 404
      env.response.content_type = "application/json"
      {error: "Revision not found"}.to_json
      next
    end
    content = rev["content"]? || {files: nil, kv: nil}.to_json
    update_page_content_with_history(db, page_id, env.auth_id, content)
    db.exec "UPDATE page_template_links SET last_revision_number=?, updated_at=CURRENT_TIMESTAMP WHERE page_id = ?", rev_to_pull, page_id
    env.response.content_type = "application/json"
    {success: true, revisionNumber: rev_to_pull}.to_json
  rescue
    env.response.status_code = 500
    env.response.content_type = "application/json"
    {error: "Internal error"}.to_json
  end
end

# Delete a specific revision (owner only). Adjust revision_counter to current MAX(revision_number).
delete "/miniapp/templates/:id/revisions/:rev" do |env|
  id = env.params.url["id"].to_i64
  rev = env.params.url["rev"].to_i64
  owner = db.scalar("SELECT user_id FROM mini_app_templates WHERE id = ?", id).as(Int64 | Nil)
  if owner.nil? || owner != env.auth_id
    env.response.status_code = 403
    env.response.content_type = "application/json"
    {error: "Forbidden"}.to_json
    next
  end
  db.exec "DELETE FROM mini_app_template_revisions WHERE template_id = ? AND revision_number = ?", id, rev
  new_max = db.scalar("SELECT COALESCE(MAX(revision_number), 0) FROM mini_app_template_revisions WHERE template_id = ?", id).as(Int64)
  db.exec "UPDATE mini_app_templates SET revision_counter = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?", new_max, id
  env.response.content_type = "application/json"
  {success: true, revisionCounter: new_max}.to_json
end
