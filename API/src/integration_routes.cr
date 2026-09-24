require "http/client"
require "openssl"
require "socket"
require "uri"

# Integrations: a named address plus the secret headers that go with it, so a
# Table's pull script or a Mini App can call an outside service without the
# token ever reaching the page, its history or an export. The request is made
# here, which also spares the service from having to allow browser calls.
#
# Anyone with an account can create one, so the request route refuses private,
# loopback and link-local addresses: otherwise it would reach whatever sits
# next to the API on its network.
module Integrations
  # Both ways, since the body is held in memory rather than streamed.
  MAX_BODY_BYTES = 10 * 1024 * 1024
  TIMEOUT        = 30.seconds
  METHODS            = %w(GET POST PUT PATCH DELETE)
  # Set by the connection itself, or not the script's to send.
  RESERVED_HEADERS = %w(host content-length connection transfer-encoding cookie)
  HEADER_NAME      = /\A[!#$%&'*+\-.^_`|~0-9A-Za-z]+\z/

  # Service answer headers a script has no use for, and that can run to
  # kilobytes. The rest travel in one response header of ours, and proxies cap
  # response headers (nginx's default buffer is 4 or 8 KB).
  UNFORWARDED_HEADERS = %w(set-cookie content-security-policy content-security-policy-report-only
    report-to reporting-endpoints nel permissions-policy content-encoding content-length transfer-encoding connection)
  MAX_FORWARDED_HEADER_BYTES = 2048

  class Refused < Exception; end

  # The request route's own headers carry text a header cannot hold as is, a
  # name or path with non-ASCII characters, so the app percent-encodes them.
  def self.header_param(env, name : String) : String?
    env.request.headers[name]?.try { |value| URI.decode(value) }
  end

  def self.error(env, status : Int32, message : String) : String
    env.response.status_code = status
    env.response.content_type = "application/json"
    {error: message}.to_json
  end

  # http or https with a host, and nothing a request path could not follow.
  def self.parse_base_url(value : String) : URI?
    uri = URI.parse(value.strip)
    return nil unless {"http", "https"}.includes?(uri.scheme)
    host = uri.host
    return nil if host.nil? || host.empty?
    return nil if uri.user || uri.query || uri.fragment
    uri
  rescue URI::Error
    nil
  end

  def self.default_port(scheme : String?) : Int32
    scheme == "https" ? 443 : 80
  end

  # A script names a path under the base address, or passes back a full
  # address the service gave it, such as a pagination link. Either way it has
  # to stay under the base address.
  def self.target_url(base : URI, path : String) : URI
    full = if path.starts_with?("http://") || path.starts_with?("https://")
             path
           elsif path.empty? || path.starts_with?('/') || path.starts_with?('?')
             base.to_s.rstrip('/') + path
           else
             raise Refused.new("The path has to start with / or be a full address under #{base}")
           end
    uri = URI.parse(full)
    same_origin = uri.scheme == base.scheme &&
                  uri.host.try(&.downcase) == base.host.try(&.downcase) &&
                  (uri.port || default_port(uri.scheme)) == (base.port || default_port(base.scheme)) &&
                  uri.user.nil?
    base_path = base.path.rstrip('/')
    segments = URI.decode(uri.path).split('/')
    under_base = base_path.empty? || uri.path == base_path || uri.path.starts_with?(base_path + "/")
    unless same_origin && under_base && !segments.includes?("..")
      raise Refused.new("#{full} is not under #{base}")
    end
    uri
  rescue URI::Error
    raise Refused.new("#{path} is not a valid address")
  end

  def self.public_ipv4?(address : String) : Bool
    octets = address.split('.').map(&.to_i)
    return false unless octets.size == 4
    a, b = octets[0], octets[1]
    return false if a == 0 || a == 10 || a == 127 || a >= 224
    return false if a == 100 && b >= 64 && b <= 127 # carrier-grade NAT, Tailscale
    return false if a == 169 && b == 254
    return false if a == 172 && b >= 16 && b <= 31
    return false if a == 192 && b == 168
    return false if a == 192 && b == 0 && octets[2] == 0
    return false if a == 198 && (b == 18 || b == 19)
    true
  end

  def self.public_address?(ip : Socket::IPAddress) : Bool
    address = ip.address.downcase
    if ip.family.inet?
      return public_ipv4?(address)
    end
    if mapped = address.lchop?("::ffff:")
      return public_ipv4?(mapped)
    end
    return false if address == "::" || address == "::1"
    # fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
    first = address.split(':').first
    return false if first.size == 4 && (first.starts_with?("fc") || first.starts_with?("fd"))
    return false if first.size == 4 && first.starts_with?("fe") && "89ab".includes?(first[2])
    return false if first.size == 4 && first.starts_with?("ff")
    true
  end

  # Connects to an address checked here rather than letting the client look
  # the host up again, so a name that changes its answer between the check
  # and the connection cannot slip past it.
  def self.connect(uri : URI) : HTTP::Client
    host = uri.host.not_nil!
    tls = uri.scheme == "https"
    port = uri.port || default_port(uri.scheme)
    addresses = Socket::Addrinfo.tcp(host, port, timeout: 10.seconds)
    raise Refused.new("#{host} did not resolve") if addresses.empty?
    addresses.each do |info|
      unless public_address?(info.ip_address)
        raise Refused.new("#{host} resolves to #{info.ip_address.address}, a private address, which integrations cannot reach")
      end
    end
    # Each address in turn, as a client looking the name up itself would: an
    # IPv6 address listed first is no use where the network has no IPv6.
    socket = nil
    last_error = nil
    addresses.each do |info|
      begin
        socket = TCPSocket.new(info.ip_address.address, port, connect_timeout: 10.seconds)
        break
      rescue ex : Socket::ConnectError | IO::TimeoutError
        last_error = ex
      end
    end
    raise last_error || Refused.new("Could not connect to #{host}") unless socket
    socket.read_timeout = TIMEOUT
    socket.write_timeout = TIMEOUT
    io = tls ? OpenSSL::SSL::Socket::Client.new(socket, context: OpenSSL::SSL::Context::Client.new, sync_close: true, hostname: host) : socket
    HTTP::Client.new(io, host, port)
  end

  def self.row_to_json(row, grants)
    headers = Hash(String, String).from_json(row[:headers])
    {
      id:          row[:id],
      name:        row[:name],
      baseUrl:     row[:base_url],
      headerNames: headers.keys,
      grants:      grants,
    }
  end

  # Header names are checked, values may not break a line. Returns an error
  # message or nil.
  def self.header_problem(name : String, value : String) : String?
    return "\"#{name}\" is not a valid header name" unless name =~ HEADER_NAME
    return "#{name} is set by the connection itself" if RESERVED_HEADERS.includes?(name.downcase)
    return "The value of #{name} cannot contain a line break" if value.includes?('\n') || value.includes?('\r')
    nil
  end
end

get "/integrations" do |env|
  rows = db.query_all(
    "SELECT id, name, base_url, headers FROM integrations WHERE user_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE",
    env.auth_id,
    as: {id: Int64, name: String, base_url: String, headers: String}
  )
  grants = db.query_all(
    "SELECT g.integration_id, p.id AS page_id, p.name AS page_name FROM integration_grants g
     JOIN pages p ON p.id = g.page_id
     WHERE p.user_id = ? AND p.deleted_at IS NULL AND g.deleted_at IS NULL
     ORDER BY p.name COLLATE NOCASE",
    env.auth_id,
    as: {integration_id: Int64, page_id: Int64, page_name: String}
  )
  env.response.content_type = "application/json"
  rows.map { |row|
    Integrations.row_to_json(row, grants.select { |g| g[:integration_id] == row[:id] }.map { |g| {pageId: g[:page_id], pageName: g[:page_name]} })
  }.to_json
end

# headers: name => value. On an update a null value keeps the value already
# saved, since the app never reads one back, and a name left out is removed.
def read_integration_input(env, existing : Hash(String, String)?) : NamedTuple(name: String, base_url: String, headers: Hash(String, String)) | String
  name = env.params.json["name"]?.as?(String).try(&.strip) || ""
  return "Give the integration a name" if name.empty?
  return "The name is too long" if name.size > 100
  base_url = env.params.json["baseUrl"]?.as?(String) || ""
  base = Integrations.parse_base_url(base_url)
  return "The base address has to be an http or https address, with no query" unless base
  given = env.params.json["headers"]?.as?(Hash(String, JSON::Any)) || {} of String => JSON::Any
  headers = {} of String => String
  given.each do |header_name, value|
    header_name = header_name.strip
    next if header_name.empty?
    header_value = if value.raw.nil?
                     existing.try(&.[header_name]?)
                   else
                     value.as_s?
                   end
    # An empty value would still be sent, and an empty Authorization header
    # makes some services refuse a request they would answer without one.
    return "Enter a value for #{header_name}, or remove it" if header_value.nil? || header_value.empty?
    if problem = Integrations.header_problem(header_name, header_value)
      return problem
    end
    headers[header_name] = header_value
  end
  {name: name, base_url: base.to_s.rstrip('/'), headers: headers}
end

def integration_name_taken?(user_id : Int64, name : String, except_id : Int64?) : Bool
  !db.query_one?(
    "SELECT id FROM integrations WHERE user_id = ? AND name = ? AND deleted_at IS NULL AND id IS NOT ?",
    user_id, name, except_id, as: Int64
  ).nil?
end

post "/integrations" do |env|
  input = read_integration_input(env, nil)
  next Integrations.error(env, 400, input) if input.is_a?(String)
  if integration_name_taken?(env.auth_id, input[:name], nil)
    next Integrations.error(env, 400, "You already have an integration named #{input[:name]}")
  end
  result = db.exec "INSERT INTO integrations(user_id, name, base_url, headers) VALUES(?, ?, ?, ?)",
    env.auth_id, input[:name], input[:base_url], input[:headers].to_json
  env.response.content_type = "application/json"
  {id: result.last_insert_id}.to_json
end

put "/integrations/:id" do |env|
  id = env.params.url["id"].to_i64
  existing = db.query_one?("SELECT headers FROM integrations WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, env.auth_id, as: String)
  next Integrations.error(env, 404, "Integration not found") unless existing
  input = read_integration_input(env, Hash(String, String).from_json(existing))
  next Integrations.error(env, 400, input) if input.is_a?(String)
  if integration_name_taken?(env.auth_id, input[:name], id)
    next Integrations.error(env, 400, "You already have an integration named #{input[:name]}")
  end
  db.exec "UPDATE integrations SET name = ?, base_url = ?, headers = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
    input[:name], input[:base_url], input[:headers].to_json, id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/integrations/:id" do |env|
  id = env.params.url["id"].to_i64
  db.exec "UPDATE integrations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL", id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

# A deleted integration waits in the Recycle Bin, secrets and all, until it
# is restored or removed from there (routes.cr, /recycle-bin).
post "/recycle-bin/restore/integration/:id" do |env|
  id = env.params.url["id"].to_i64
  name = db.query_one?("SELECT name FROM integrations WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", id, env.auth_id, as: String)
  next Integrations.error(env, 404, "Integration not found in the Recycle Bin") unless name
  if integration_name_taken?(env.auth_id, name, id)
    next Integrations.error(env, 409, "You already have an integration named #{name}. Rename or delete that one first.")
  end
  db.exec "UPDATE integrations SET deleted_at = NULL WHERE id = ? AND user_id = ?", id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/recycle-bin/permanent/integration/:id" do |env|
  id = env.params.url["id"].to_i64
  db.exec "DELETE FROM integration_grants WHERE integration_id = (SELECT id FROM integrations WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL)", id, env.auth_id
  db.exec "DELETE FROM integrations WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL", id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

# Makes one request through a named integration and passes the answer through
# as bytes, whatever it is: text, JSON or an image. What describes the request
# comes in X-Integration-* headers, percent-encoded, and the body is the one to
# send. The app sends it as application/octet-stream, since Kemal reads a JSON
# or form body itself and this route would find it empty.
#
# The service's status and headers come back in X-Integration-Status and
# X-Integration-Headers (percent-encoded JSON). Without those, the answer is
# ours: the request was refused or never got one, and the body says why.
post "/integration-requests" do |env|
  name = Integrations.header_param(env, "X-Integration-Name") || ""
  method = (Integrations.header_param(env, "X-Integration-Method") || "GET").upcase
  path = Integrations.header_param(env, "X-Integration-Path") || ""

  row = db.query_one?(
    "SELECT base_url, headers FROM integrations WHERE user_id = ? AND name = ? AND deleted_at IS NULL",
    env.auth_id, name, as: {base_url: String, headers: String}
  )
  next Integrations.error(env, 404, "There is no integration named \"#{name}\". Add it under Integrations in the sidebar.") unless row
  next Integrations.error(env, 400, "#{method} is not a method integrations send") unless Integrations::METHODS.includes?(method)

  begin
    base = Integrations.parse_base_url(row[:base_url]).not_nil!
    uri = Integrations.target_url(base, path)

    given_headers = begin
      Hash(String, String).from_json(Integrations.header_param(env, "X-Integration-Headers") || "{}")
    rescue JSON::ParseException | TypeCastError
      raise Integrations::Refused.new("The request headers have to be names and string values")
    end
    headers = HTTP::Headers.new
    given_headers.each do |header_name, header_value|
      if problem = Integrations.header_problem(header_name, header_value)
        raise Integrations::Refused.new(problem)
      end
      headers[header_name] = header_value
    end
    # The saved secrets win over anything the script sends.
    Hash(String, String).from_json(row[:headers]).each { |k, v| headers[k] = v }
    port = uri.port || Integrations.default_port(uri.scheme)
    headers["Host"] = port == Integrations.default_port(uri.scheme) ? uri.host.not_nil! : "#{uri.host}:#{port}"
    headers["User-Agent"] ||= "Journals"

    body = nil
    if request_body = env.request.body
      buffer = IO::Memory.new
      copied = IO.copy(request_body, buffer, Integrations::MAX_BODY_BYTES + 1)
      raise Integrations::Refused.new("The request body is larger than 10 MB") if copied > Integrations::MAX_BODY_BYTES
      body = buffer.to_slice unless copied == 0
    end

    client = Integrations.connect(uri)
    begin
      request = HTTP::Request.new(method, uri.request_target, headers, body)
      client.exec(request) do |response|
        answer = IO::Memory.new
        copied = IO.copy(response.body_io, answer, Integrations::MAX_BODY_BYTES + 1)
        raise Integrations::Refused.new("The answer is larger than 10 MB") if copied > Integrations::MAX_BODY_BYTES
        forwarded = {} of String => String
        response.headers.each do |key, values|
          next if Integrations::UNFORWARDED_HEADERS.includes?(key.downcase)
          value = values.join(", ")
          next if value.bytesize > Integrations::MAX_FORWARDED_HEADER_BYTES
          forwarded[key.downcase] = value
        end
        env.response.status_code = 200
        env.response.headers["X-Integration-Status"] = response.status_code.to_s
        env.response.headers["X-Integration-Headers"] = URI.encode_path_segment(forwarded.to_json)
        env.response.headers["Access-Control-Expose-Headers"] = "X-Integration-Status, X-Integration-Headers"
        # The body is whatever the service sent, so it must never be read as a
        # page on this origin, where the login cookie works.
        env.response.content_type = "application/octet-stream"
        env.response.headers["X-Content-Type-Options"] = "nosniff"
        env.response.headers["Content-Disposition"] = "attachment"
        env.response.headers["Content-Security-Policy"] = "sandbox"
        env.response.write(answer.to_slice)
      end
    ensure
      client.close
    end
    nil
  rescue ex : Integrations::Refused
    Integrations.error(env, 400, ex.message || "Refused")
  rescue ex : Socket::Addrinfo::Error
    Integrations.error(env, 502, "Could not find #{base.try(&.host)}: #{ex.message}")
  rescue ex : IO::TimeoutError
    Integrations.error(env, 504, "#{name} did not answer in time")
  rescue ex
    Integrations.error(env, 502, "Could not reach #{name}: #{ex.message}")
  end
end

# The integrations a Mini App page has been allowed to use.
get "/integration-grants/:page_id" do |env|
  page_id = env.params.url["page_id"].to_i64
  names = db.query_all(
    "SELECT i.name FROM integration_grants g
     JOIN integrations i ON i.id = g.integration_id
     JOIN pages p ON p.id = g.page_id
     WHERE g.page_id = ? AND p.user_id = ? AND i.user_id = p.user_id
       AND g.deleted_at IS NULL AND i.deleted_at IS NULL AND p.deleted_at IS NULL",
    page_id, env.auth_id, as: String
  )
  env.response.content_type = "application/json"
  names.to_json
end

put "/integration-grants/:page_id/:integration_id" do |env|
  page_id = env.params.url["page_id"].to_i64
  integration_id = env.params.url["integration_id"].to_i64
  page = db.query_one?("SELECT id FROM pages WHERE id = ? AND user_id = ? AND type = 'MiniApp' AND deleted_at IS NULL", page_id, env.auth_id, as: Int64)
  next Integrations.error(env, 404, "Mini App page not found") unless page
  integration = db.query_one?("SELECT id FROM integrations WHERE id = ? AND user_id = ? AND deleted_at IS NULL", integration_id, env.auth_id, as: Int64)
  next Integrations.error(env, 404, "Integration not found") unless integration
  db.exec "
    INSERT INTO integration_grants(page_id, integration_id) VALUES(?, ?)
    ON CONFLICT(page_id, integration_id) DO UPDATE SET deleted_at = NULL, created_at = CURRENT_TIMESTAMP
  ", page_id, integration_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

delete "/integration-grants/:page_id/:integration_id" do |env|
  page_id = env.params.url["page_id"].to_i64
  integration_id = env.params.url["integration_id"].to_i64
  db.exec "
    UPDATE integration_grants SET deleted_at = CURRENT_TIMESTAMP
    WHERE page_id = ? AND integration_id = ? AND deleted_at IS NULL
      AND integration_id IN (SELECT id FROM integrations WHERE user_id = ?)
  ", page_id, integration_id, env.auth_id
  env.response.content_type = "application/json"
  {success: true}.to_json
end

# A template brings code its owner may not have written, so a page that takes
# one has to be allowed again.
def revoke_integration_grants(page_id : Int64)
  db.exec "UPDATE integration_grants SET deleted_at = CURRENT_TIMESTAMP WHERE page_id = ? AND deleted_at IS NULL", page_id
end
