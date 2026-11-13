-- ============================================
-- whip_autos power — every car's top speed raised by Config.TopSpeedBonusMph (client)
-- ============================================
-- Top speed in GTA is the gearing: fInitialDriveMaxFlatVel, the speed at redline in top gear. The bonus
-- is ADDED to it (an `add` layer), so the engine is untouched and a car only gets there with the power.

local FLATVEL_PER_MPH = 1.609344 * 0.9 / 1.2   -- redline km/h = fInitialDriveMaxFlatVel × 1.2 ÷ 0.9 (server/engines.lua)

local layer = PowerHandling.driverLayer('topSpeed', 'top speed', function(veh)
    local mph = tonumber(Config.TopSpeedBonusMph) or 0
    if mph <= 0 or not PowerClasses[GetVehicleClass(veh)] then return nil end
    return { add = { fInitialDriveMaxFlatVel = mph * FLATVEL_PER_MPH } }
end)

Whip.onConfigChanged('TopSpeedBonusMph', layer.refresh)
