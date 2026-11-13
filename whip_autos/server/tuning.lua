-- ============================================
-- whip_autos — tuning on the server
-- ============================================
-- Prices tuning lines and writes them as whip_core VehicleData (keys in shared/tuning.lua, owned by this
-- resource); client/tuning.lua applies them. An engine swap costs EngineSwapPrice (back to stock is
-- free); stance, handling setup and drivetrain are paid once per car, then adjusted free.

TuningServer = {}

--- What this car carries now: engine, stance, setup and drivetrain data, each nil when absent.
function TuningServer.current(vehicleId)
    local function get(key)
        local v = exports.whip_core:GetVehicleData(vehicleId, key)
        return type(v) == 'table' and v or nil
    end
    return get(TUNING_ENGINE_KEY), get(TUNING_STANCE_KEY), get(TUNING_SETUP_KEY), get(TUNING_DRIVE_KEY)
end

--- Paid once, then free. A value identical to what the car has is dropped (`0, nil`).
local function onceThenFree(saved, clean, fields, key, price)
    if saved then
        for _, f in ipairs(fields) do
            if saved[f.key] ~= clean[f.key] then return 0, { key = key, value = clean } end   -- owned: free
        end
        return 0, nil
    end
    return price, { key = key, value = clean }
end

--- Checks and prices one tuning line against the car:
---   { slot = 'engine', engine = '<model>' | 'stock' }
---   { slot = 'stance', stance = { height, trackF, trackR, camberF, camberR, width, size } }
---   { slot = 'setup',  setup = { springs, dampers, antiroll, steering, grip, handbrake } }
---   { slot = 'drive',  drive = { layout = 'stock'|'fwd'|'rwd'|'awd', front = 30..70 } }
--- Returns the price and the change to store ({ key, value }), `0, nil` for what the car already has,
--- or nil and why.
function TuningServer.price(vehicleId, line)
    local engine, stance, setup, drive = TuningServer.current(vehicleId)
    if line.slot == 'engine' then
        local want = type(line.engine) == 'string' and line.engine:lower() or nil
        if not want or #want > 40 then return nil, 'Pick an engine' end
        if want == 'stock' then
            if not engine then return 0, nil end                         -- already stock
            return 0, { key = TUNING_ENGINE_KEY, value = nil }
        end
        if engine and engine.model == want then return 0, nil end      -- already fitted
        local data = Engines.data(want)
        if not data then return nil, 'That engine is not available' end
        return Config.Tuning.EngineSwapPrice, { key = TUNING_ENGINE_KEY, value = data }
    elseif line.slot == 'stance' then
        local clean, why = TuningCleanStance(line.stance)
        if not clean then return nil, why end
        -- The saved stance is cleaned too, so a field added later compares as neutral.
        return onceThenFree(stance and TuningCleanStance(stance), clean, TUNING_STANCE_FIELDS,
            TUNING_STANCE_KEY, Config.Tuning.StancePrice)
    elseif line.slot == 'setup' then
        local clean, why = TuningCleanSetup(line.setup)
        if not clean then return nil, why end
        return onceThenFree(setup and TuningCleanSetup(setup), clean, TUNING_SETUP_FIELDS,
            TUNING_SETUP_KEY, Config.Tuning.SetupPrice)
    elseif line.slot == 'drive' then
        local clean, why = TuningCleanDrive(line.drive)
        if not clean then return nil, why end
        -- Never bought and asking for stock: nothing to do.
        if not drive and clean.layout == 'stock' then return 0, nil end
        return onceThenFree(drive and TuningCleanDrive(drive), clean, TUNING_DRIVE_FIELDS,
            TUNING_DRIVE_KEY, Config.Tuning.DrivetrainPrice)
    end
    return nil, 'Not a tuning line'
end

--- Stores tuning changes, and `props` (the parts bought with them) if given, on the car in one write
--- with the payment the order holds: all of it lands or none does, so a failure is refunded in full.
---@param vehicleId number
---@param changes table  list of { key, value } (value nil clears)
---@param props table|nil  appearance fields for SetVehicleAppearance
---@return boolean ok, string|nil why
function TuningServer.write(vehicleId, changes, props)
    local data, clearData = {}, {}
    for _, c in ipairs(changes) do
        if c.value == nil then clearData[#clearData + 1] = c.key else data[c.key] = c.value end
    end
    return exports.whip_core:SetVehicleAppearance(vehicleId, props or {}, { data = data, clearData = clearData })
end
