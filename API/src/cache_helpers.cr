# etag, add_cache_headers, cache_request? are from https://github.com/crystal-lang/crystal/blob/008d76a15778772fb4b8bca2a38d834985dd44a8/src/http/server/handlers/static_file_handler.cr

def etag(modification_time)
  %{W/"#{modification_time.to_unix}"}
end

def add_cache_headers(response_headers : HTTP::Headers, last_modified : Time) : Nil
  response_headers["Etag"] = etag(last_modified)
  response_headers["Last-Modified"] = HTTP.format_time(last_modified)
end

def cache_request?(context : HTTP::Server::Context, last_modified : Time) : Bool
  # According to RFC 7232:
  # A recipient must ignore If-Modified-Since if the request contains an If-None-Match header field
  if if_none_match = context.request.if_none_match
    match = {"*", context.response.headers["Etag"]}
    if_none_match.any? { |etag| match.includes?(etag) }
  elsif if_modified_since = context.request.headers["If-Modified-Since"]?
    header_time = HTTP.parse_time(if_modified_since)
    # File mtime probably has a higher resolution than the header value.
    # An exact comparison might be slightly off, so we add 1s padding.
    # Static files should generally not be modified in subsecond intervals, so this is perfectly safe.
    # This might be replaced by a more sophisticated time comparison when it becomes available.
    !!(header_time && last_modified <= header_time + 1.second)
  else
    false
  end
end

# from: https://github.com/kemalcr/kemal/blob/cb9adcd188162f1e3c83ff98263d3587b9a2f9ab/src/kemal/static_file_handler.cr#L79-L81
def modification_time(file_path)
  File.info(file_path).modification_time
end
