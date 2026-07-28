-- Dump the game's block registrations as JSON, so the wiki can be regenerated
-- from the source of truth instead of transcribed by hand.
--
-- It works by defining `register_block` and `register_item` itself and then
-- loading the game's Lua files, which means it sees exactly what the game
-- sees — including the blocks that are produced by helper functions rather
-- than written out one at a time.
--
--   lua tools/dump_blocks.lua ../../Cpp/Snake_v2 data/blocks.generated.json
--
-- Then fold the result into data/blocks.json, keeping the hand-written prose:
--
--   node tools/merge-blocks.mjs
--
-- Requires a Lua 5.4 interpreter on PATH. Nothing else.

local root = arg[1] or "."
local out  = arg[2] or "data/blocks.generated.json"

local blocks, items = {}, {}

function register_block(def) blocks[#blocks + 1] = def end
function register_item(def)  items[#items + 1] = def end

-- Which files to load, and what to tag their blocks with.
local sources = {
  { path = "lua/blocks/core.lua",    origin = "core" },
  { path = "lua/blocks/sensing.lua", origin = "sensing" },
  { path = "lua/economy.lua",        origin = "core" },
}

-- Every mod directory, so the wiki can show what a mod adds.
local function add_mods()
  local ok, pipe = pcall(io.popen, 'ls "' .. root .. '/mods" 2>/dev/null')
  if not ok or not pipe then return end
  for name in pipe:lines() do
    if name ~= "" then
      sources[#sources + 1] =
        { path = "mods/" .. name .. "/init.lua", origin = "mod", mod = name }
    end
  end
  pipe:close()
end
add_mods()

local first_of_source = {}
for _, s in ipairs(sources) do
  local path = root .. "/" .. s.path
  local chunk = loadfile(path)
  if chunk then
    first_of_source[#blocks + 1] = s
    chunk()
  else
    io.stderr:write("skipped (not found): " .. path .. "\n")
  end
end

-- Walk the boundaries back over the blocks each file produced.
local current
for i = 1, #blocks do
  if first_of_source[i] then current = first_of_source[i] end
  blocks[i].__origin = current and current.origin or "core"
  blocks[i].__mod = current and current.mod or nil
end

---------------------------------------------------------------- json output

local function esc(s)
  return (s:gsub('[%c"\\]', function (c)
    local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n',
                  ['\r'] = '\\r', ['\t'] = '\\t' }
    return map[c] or string.format('\\u%04x', c:byte())
  end))
end

local encode

local function encode_array(t, indent)
  if #t == 0 then return "[]" end
  local parts = {}
  for _, v in ipairs(t) do
    parts[#parts + 1] = indent .. "  " .. encode(v, indent .. "  ")
  end
  return "[\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "]"
end

local function encode_object(t, indent)
  local keys = {}
  for k in pairs(t) do
    if type(k) == "string" then keys[#keys + 1] = k end
  end
  table.sort(keys)
  if #keys == 0 then return "{}" end
  local parts = {}
  for _, k in ipairs(keys) do
    parts[#parts + 1] = indent .. '  "' .. esc(k) .. '": ' .. encode(t[k], indent .. "  ")
  end
  return "{\n" .. table.concat(parts, ",\n") .. "\n" .. indent .. "}"
end

encode = function (v, indent)
  indent = indent or ""
  local ty = type(v)
  if v == nil then return "null" end
  if ty == "boolean" then return tostring(v) end
  if ty == "number" then
    return (v % 1 == 0) and string.format("%d", v) or tostring(v)
  end
  if ty == "string" then return '"' .. esc(v) .. '"' end
  if ty == "table" then
    if #v > 0 then return encode_array(v, indent) end
    return encode_object(v, indent)
  end
  return "null"          -- functions, userdata: not data
end

------------------------------------------------------------------ normalize

-- `exec = { "yes", "no" }` and `exec = { { "yes", desc = "…" } }` are both
-- legal, so flatten them into one shape the site can rely on.
local function ports(list)
  if not list then return {} end
  local outp = {}
  for _, e in ipairs(list) do
    if type(e) == "string" then
      outp[#outp + 1] = { id = e }
    else
      outp[#outp + 1] = { id = e[1] or e.id, desc = e.desc }
    end
  end
  return outp
end

local function fields(list)
  if not list then return {} end
  local outp = {}
  for _, f in ipairs(list) do
    outp[#outp + 1] = {
      id = f.id, type = f.type, min = f.min, max = f.max,
      default = f.default, options = f.options, desc = f.desc,
    }
  end
  return outp
end

local clean = {}
for _, b in ipairs(blocks) do
  clean[#clean + 1] = {
    id = b.id,
    name = b.name,
    category = b.category,
    cost = b.cost or 0,
    module = b.module,
    origin = b.__origin,
    mod = b.__mod,
    desc = b.desc,
    execIn = b.exec_in ~= false,
    exec = ports(b.exec),
    terminal = (b.exec ~= nil and #b.exec == 0) or nil,
    params = fields(b.params),
    inputs = fields(b.inputs),
    outputs = fields(b.outputs),
  }
end

local clean_items = {}
for _, it in ipairs(items) do
  clean_items[#clean_items + 1] = {
    id = it.id, name = it.name, weight = it.weight,
    score = it.score, grows = it.grows and true or false,
  }
end

local fh = assert(io.open(out, "w"))
fh:write(encode({ blocks = clean, items = clean_items }, ""), "\n")
fh:close()

io.stderr:write(string.format("%d blocks, %d items -> %s\n", #clean, #clean_items, out))
