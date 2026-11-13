-- Director goals: what a Customise Vehicle goal asks for. The Director's "Goal: Customise Vehicle" card
-- (server/director.lua) sends a player into Whiplash with a list of work to do. Its two switches say what:
--   Must be customised a specific way   one of the card's ways, picked at random each run: a whole look picked in
--                                       Whiplash from the card (client/look.lua), each of its parts a row
--   Can be customised any way           a minimum spend: what the parts they fit must come to (one row)
-- Both: both are asked for. Neither (or a spend of nothing): any one part.
-- The server reads the list to tick it off when a basket is paid for and to work out the pay, the client to show the
-- checklist inside the shop.
--
-- A row: { how, text, done?, ... }
--   how 'any'     anything on the car changed (parts, paint, tuning; not a repair)
--       'exact'   a way's own part: `slot`, `index` (and `wheelType`), an `engine`, a `layout`
--       'spend'   parts worth `min` at least: `paid` = { [slot] = the dearest bought for it }, `spent` their sum
-- A row ticks off on what is bought, or at the start when the car already meets it (an exact part). A slot bought
-- twice counts once, at its dearest.

ShopGoal = {}

--- The most lines a way keeps: it is kept on the card in the scenario, 4 KB at most, and a line (cut short below)
--- is under 120 bytes. A car's look (client/look.lua: how it spawns) keeps as many.
ShopGoal.MAX_STANDARD = 24

--- The most ways one card picks from.
ShopGoal.MAX_WAYS = 8

--- Drivetrain layouts.
local LAYOUT = { awd = 'AWD', fwd = 'FWD', rwd = 'RWD', stock = 'stock' }

local function int(v) return math.tointeger(tonumber(v)) end

--- $12,500.
function ShopGoal.money(n)
    local s = tostring(math.floor(tonumber(n) or 0))
    local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
    return '$' .. out:gsub('^,', '')
end

-- ============================================
-- Lines kept: a car's look, a card's way
-- ============================================
-- Kept as short lines: { s = slot, i = index, w = wheelType?, e = engine?, l = layout?, v = a stance's or handling
-- setup's values?, n = name, c = category, k = the shop's category key (its card shows it chosen) }. A car's look
-- keeps its sliders too; a way never does (they are never matched exactly).

--- A basket line as a car's look or a way keeps it, or nil for what it does not hold (a repair; a stance or a
--- handling setup unless `sliders`).
---@param line table  a basket line
---@param sliders boolean|nil  keep a stance's and a handling setup's values (a look)
---@return table|nil
function ShopGoal.pack(line, sliders)
    local slot = line.slot
    if slot == nil or SHOP_SERVICES[slot] then return nil end
    local name = tostring(line.name or ''):sub(1, 32)
    local cat = tostring(line.category or ''):sub(1, 24)
    local key = type(line.key) == 'string' and line.key:sub(1, 24) or nil
    if slot == 'stance' or slot == 'setup' then
        if not sliders then return nil end
        local clean = slot == 'stance' and TuningCleanStance(line.stance) or TuningCleanSetup(line.setup)
        if not clean then return nil end
        return { s = slot, v = clean, n = name, c = cat, k = key }
    end
    if slot == 'engine' then
        if type(line.engine) ~= 'string' then return nil end
        return { s = 'engine', e = line.engine:lower(), n = name, c = cat, k = key }
    end
    if slot == 'drive' then
        local layout = type(line.drive) == 'table' and line.drive.layout or line.layout
        if not LAYOUT[layout] then return nil end
        return { s = 'drive', l = layout, n = name, c = cat, k = key }
    end
    local index = int(line.index)
    if index == nil then return nil end
    return { s = int(slot) or slot, i = index, w = int(line.wheelType), n = name, c = cat, k = key }
end

--- A kept line back as a basket line { slot, index, wheelType, engine, drive, name, category, key }, or nil.
---@param k table
---@return table|nil
function ShopGoal.unpack(k)
    if type(k) ~= 'table' then return nil end
    local slot = int(k.s) or k.s
    if type(slot) ~= 'number' and type(slot) ~= 'string' then return nil end
    local line = { slot = slot, name = tostring(k.n or ''), category = tostring(k.c or ''),
                   key = type(k.k) == 'string' and k.k or nil }
    if slot == 'engine' then
        if type(k.e) ~= 'string' then return nil end
        line.engine, line.index = k.e, 0
    elseif slot == 'stance' or slot == 'setup' then
        if type(k.v) ~= 'table' then return nil end
        line[slot], line.index = k.v, 0
    elseif slot == 'drive' then
        if not LAYOUT[k.l] then return nil end
        line.drive, line.layout, line.index = { layout = k.l, front = 50 }, k.l, 0
    else
        line.index, line.wheelType = int(k.i), int(k.w)
        if line.index == nil then return nil end
    end
    return line
end

--- A line's words: "Primary paint: Red".
local function lineText(line)
    local label = line.category ~= '' and line.category or tostring(line.slot)
    return line.name ~= '' and ('%s: %s'):format(label, line.name) or label
end

--- A way (a look picked in Whiplash for the card: client/look.lua) as its entry on the card: the lines it keeps (no
--- sliders: never matched exactly), the model it was picked on, and its words for the card's row.
---@param look table  kept lines (ShopGoal.pack)
---@param model string
---@return table|nil way  { text, model, look }; nil when it asks for nothing
function ShopGoal.way(look, model)
    local kept, names = {}, {}
    for _, k in ipairs(type(look) == 'table' and look or {}) do
        local line = ShopGoal.unpack(k)
        if line and line.slot ~= 'stance' and line.slot ~= 'setup' and #kept < ShopGoal.MAX_STANDARD then
            kept[#kept + 1] = k
            names[#names + 1] = lineText(line)
        end
    end
    if #kept == 0 then return nil end
    local text = ('%s: %s'):format(model, table.concat(names, ', ', 1, math.min(3, #names)))
    if #names > 3 then text = text .. (', and %d more'):format(#names - 3) end
    return { text = text:sub(1, 120), model = model, look = kept }
end

--- The way a run asks for: one of the card's at random, of those picked on the model the run made (any of them when
--- none was), or nil when it has none.
---@param ways table|nil  the card's entries
---@param model string|nil  the car's model as made
---@return table|nil
function ShopGoal.pickWay(ways, model)
    local all, same = {}, {}
    for _, w in ipairs(type(ways) == 'table' and ways or {}) do
        if type(w) == 'table' and type(w.look) == 'table' and #w.look > 0 then
            all[#all + 1] = w
            if model and type(w.model) == 'string' and w.model:lower() == model:lower() then same[#same + 1] = w end
        end
    end
    local list = #same > 0 and same or all
    if #list == 0 then return nil end
    return list[math.random(#list)]
end

-- ============================================
-- The rows
-- ============================================

--- The spend row's words, with what has been spent so far.
local function spendText(row)
    return ('Spend at least %s on parts (%s so far)'):format(ShopGoal.money(row.min), ShopGoal.money(row.spent or 0))
end

--- The rows a goal's fields ask for: the way picked for this run, each of its parts a row; the spend; else any one
--- part.
---@param props table  the card's fields: exact, free, spend
---@param way table|nil  the way picked for this run (ShopGoal.pickWay)
---@return table rows
function ShopGoal.rows(props, way)
    local rows = {}
    props = type(props) == 'table' and props or {}
    if props.exact == true and way then
        for _, k in ipairs(way.look) do
            local line = ShopGoal.unpack(k)
            if line and line.slot ~= 'stance' and line.slot ~= 'setup' then
                rows[#rows + 1] = { how = 'exact', slot = line.slot, index = line.index, wheelType = line.wheelType,
                                    engine = line.engine, layout = line.layout, text = lineText(line) }
            end
        end
    end
    local min = props.free == true and math.floor(tonumber(props.spend) or 0) or 0
    if min > 0 then
        local row = { how = 'spend', min = min, spent = 0, paid = {} }
        row.text = spendText(row)
        rows[#rows + 1] = row
    end
    if #rows == 0 then return { { how = 'any', text = 'Change any one part' } } end
    return rows
end

-- ============================================
-- Ticking rows off
-- ============================================

--- Is this basket line work on the car (anything but a repair)?
---@param line table  { slot, index?, tuning? }
---@return boolean
function ShopGoal.isPart(line)
    return line.slot ~= nil and not SHOP_SERVICES[line.slot]
end

local function layoutOf(line)
    return line.layout or (type(line.drive) == 'table' and line.drive.layout) or nil
end

--- Would buying this one line do this row's work? (A spend row's is the sum: ShopGoal.spend.)
---@param row table
---@param line table  { slot, index, wheelType?, engine?, drive? | layout? }
---@return boolean
function ShopGoal.lineMeets(row, line)
    if row.how == 'any' then return ShopGoal.isPart(line) end
    if row.how ~= 'exact' then return false end
    local slot = line.slot
    -- The basket says a mod slot as a number; a line from the page or a save may carry it as text.
    if type(row.slot) == 'number' then slot = int(slot) end
    if slot ~= row.slot then return false end
    if slot == 'engine' then
        return type(line.engine) == 'string' and line.engine:lower() == row.engine
    end
    if slot == 'drive' then
        local l = layoutOf(line)
        return l ~= nil and l == row.layout
    end
    local index = int(line.index)
    return index ~= nil and index == row.index and (row.wheelType == nil or int(line.wheelType) == row.wheelType)
end

--- A spend row with these lines paid for too: what it comes to (each slot once, at its dearest). Writes nothing
--- unless `keep` (the order was paid: the row remembers them).
---@param row table
---@param lines table  basket lines, each with its price
---@param keep boolean|nil
---@return number spent
function ShopGoal.spend(row, lines, keep)
    local paid = {}
    for k, v in pairs(row.paid or {}) do paid[k] = v end
    for _, line in ipairs(lines) do
        local price = tonumber(line.price) or 0
        if price > 0 and ShopGoal.isPart(line) then
            local key = tostring(line.slot)
            if price > (paid[key] or 0) then paid[key] = price end
        end
    end
    local spent = 0
    for _, v in pairs(paid) do spent = spent + v end
    if keep then
        row.paid, row.spent = paid, spent
        row.text = spendText(row)
    end
    return spent
end

--- Does the car already meet this row? Only a way's exact part can, and it does whenever the shop would not sell it
--- again: the same test for parts (ShopFitted), and for an engine or a drivetrain what the car carries.
---@param row table
---@param props table|nil  the car's stored appearance
---@param turboIndex number|nil  the car's turbo stage (TuningTurboIndex: its data, not its look; 0 for none)
---@param tuning table|nil  { engine, drive }: the car's engine swap and drivetrain data (TuningServer.current), nil for none
---@return boolean
function ShopGoal.propsMeet(row, props, turboIndex, tuning)
    if row.how ~= 'exact' then return false end
    local slot = row.slot
    if slot == 'stance' or slot == 'setup' then return false end
    tuning = type(tuning) == 'table' and tuning or {}
    if slot == 'engine' then
        local engine = type(tuning.engine) == 'table' and tuning.engine.model or 'stock'
        return engine == row.engine
    end
    if slot == 'drive' then
        local layout = type(tuning.drive) == 'table' and tuning.drive.layout or 'stock'
        return layout == row.layout
    end
    return ShopFitted(props, row, turboIndex)
end

--- How much of each basket line the job pays: for each row not yet done, the dearest line that does its work, in full
--- (each line pays for one row at most); then a spend row's, line by line in the basket's order, up to what is left
--- of its minimum spend and no further (the line that crosses it is paid for in part: the buyer pays the rest).
---@param rows table
---@param lines table   basket lines
---@param priceOf fun(line: table, i: integer): number
---@return table paid  { [line index] = dollars the job pays of it }
function ShopGoal.cover(rows, lines, priceOf)
    local paid = {}
    for _, row in ipairs(rows or {}) do
        if not row.done and row.how ~= 'spend' then
            local best, bestPrice
            for i, line in ipairs(lines) do
                if not paid[i] and ShopGoal.lineMeets(row, line) then
                    local price = tonumber(priceOf(line, i)) or 0
                    if not best or price > bestPrice then best, bestPrice = i, price end
                end
            end
            if best then paid[best] = math.max(0, bestPrice) end
        end
    end
    for _, row in ipairs(rows or {}) do
        if not row.done and row.how == 'spend' then
            local need, covered = row.min - (row.spent or 0), 0
            for i, line in ipairs(lines) do
                if covered >= need then break end
                local price = tonumber(priceOf(line, i)) or 0
                if not paid[i] and price > 0 and ShopGoal.isPart(line) then
                    local part = math.min(price, need - covered)
                    paid[i] = part
                    covered = covered + part
                end
            end
        end
    end
    return paid
end

--- Every row ticked off?
---@param rows table
---@return boolean
function ShopGoal.finished(rows)
    for _, row in ipairs(rows or {}) do
        if not row.done then return false end
    end
    return true
end
