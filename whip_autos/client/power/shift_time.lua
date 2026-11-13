-- ============================================
-- whip_autos power — how long a gear change takes (client)
-- ============================================
-- Per kind of vehicle (Config.ShiftTimeByClass), then per model (Config.ShiftTimeByModel). With
-- Config.RealisticShifting each transmission upgrade makes it quicker, Config.TransmissionSteps of the
-- way to Config.TransmissionBestShare of stock; off, the kinds use Config.PlainShiftTimeByClass.
--
-- Shift time in GTA is one over the clutch rate (fClutchChangeRateScaleUpShift / DownShift): twice as
-- long is the rate halved. So the layer SCALES both by 1 ÷ the time, after an engine swap's `set`.

--- The page's limits (shared/settings.lua) again, for the product of kind × upgrade. 0.25 is a
--- sequential box: no upgrade goes quicker.
local MIN_MULT, MAX_MULT = 0.25, 5.0
local MIN_SHARE, MAX_SHARE = 0.02, 1.0

--- GTA's transmission mod slot: -1 stock, 0 the first upgrade, 1 the second, 2 the third.
local TRANSMISSION_SLOT = 13

--- With realistic shifting, how often the driven car's transmission is read, to follow one fitted or
--- tried on at Whiplash: whip has no client event for a car's parts changing.
local TRANSMISSION_CHECK_MS = 1000

--- Config.ShiftTimeByModel by model hash.
local byModel = {}

-- Config is read as config.lua has it when its row is left off the page (a value outside its limits),
-- so every table here is checked for being one.
local function buildModels()
    byModel = {}
    local models = Config.ShiftTimeByModel
    for name, mult in pairs(type(models) == 'table' and models or {}) do
        if type(name) == 'string' then byModel[GetHashKey(name)] = mult end
    end
end
buildModels()

local function realistic() return Config.RealisticShifting == true end

--- Transmission upgrades fitted: 0 stock, 1 to 3 (more on a car that has more).
---@param veh number
---@return integer
local function transmissionLevel(veh)
    local index = GetVehicleMod(veh, TRANSMISSION_SLOT)
    if type(index) ~= 'number' or index < 0 then return 0 end
    return index + 1
end

--- How far an upgrade level goes from stock (0) to fully upgraded (1); past the list, the last entry.
---@param level integer
---@return number
local function stepFor(level)
    if level <= 0 then return 0.0 end
    local steps = type(Config.TransmissionSteps) == 'table' and Config.TransmissionSteps or {}
    local step = tonumber(steps[math.min(level, #steps)]) or 1.0
    return math.max(0.0, math.min(1.0, step))
end

--- This car's gear change time against GTA's own, or nil when it is not a kind this touches.
---@param veh number
---@return number|nil
local function multiplierFor(veh)
    local class = PowerClasses[GetVehicleClass(veh)]
    if not class then return nil end
    local byClass = realistic() and Config.ShiftTimeByClass or Config.PlainShiftTimeByClass
    if type(byClass) ~= 'table' then byClass = {} end
    local mult = tonumber(byModel[GetEntityModel(veh)]) or tonumber(byClass[class.key])
    if not mult then return nil end
    if realistic() then
        local share = tonumber(Config.TransmissionBestShare) or 1.0
        share = math.max(MIN_SHARE, math.min(MAX_SHARE, share))
        mult = mult * (1.0 - (1.0 - share) * stepFor(transmissionLevel(veh)))
    end
    return math.max(MIN_MULT, math.min(MAX_MULT, mult))
end

local driven = nil      -- the car this player drives, layer or not
local watchTurn = 0     -- bumped by every watch started, so an older one stops
local layer             -- set below; declared here so the watch can reach it

--- With realistic shifting, follow the driven car's transmission. Ends when the car is left or
--- realistic shifting goes off.
local function watchTransmission()
    watchTurn = watchTurn + 1
    local turn, veh = watchTurn, driven
    if not veh or not realistic() or not PowerClasses[GetVehicleClass(veh)] then return end
    CreateThread(function()
        local level = transmissionLevel(veh)
        while true do
            Wait(TRANSMISSION_CHECK_MS)
            if turn ~= watchTurn or driven ~= veh or not realistic() or not DoesEntityExist(veh)
                or GetResourceState('whip_core') ~= 'started' then return end
            local now = transmissionLevel(veh)
            if now ~= level then
                level = now
                layer.apply(veh)
            end
        end
    end)
end

layer = PowerHandling.driverLayer('shiftTime', 'shift time', function(veh)
    local mult = multiplierFor(veh)
    if not mult or mult == 1 then return nil end
    local rate = 1 / mult
    return { scale = { fClutchChangeRateScaleUpShift = rate, fClutchChangeRateScaleDownShift = rate } }
end, function(veh)
    driven = veh
    watchTransmission()
end)

for _, path in ipairs({ 'RealisticShifting', 'TransmissionBestShare', 'TransmissionSteps', 'ShiftTimeByClass', 'PlainShiftTimeByClass' }) do
    Whip.onConfigChanged(path, layer.refresh)
end
Whip.onConfigChanged('ShiftTimeByModel', function()
    buildModels()
    layer.refresh()
end)
