-- ============================================
-- whip_autos — Force Open Whiplash, a task on a car's list in the Director
-- ============================================
-- Whip.task is one call both sides make: the server sends the task as data, each game keeps run. The game
-- running the car plays the step and asks the server (server/director.lua, whip_autos:server:taskOpen),
-- which works out who in the car gets Whiplash: its driver; with no driver, the passenger nearest the wheel
-- moves over first. A passenger with a driver: nothing.

Whip.task('autos.openWhiplash', {
    label = 'Force Open Whiplash',
    desc = 'Puts this car\'s driver into Whiplash, wherever it is (no driver: the passenger nearest the wheel moves over).',
    group = 'car',
    kinds = { 'vehicle' },
    timing = 'instant',
    once = true,         -- a new owner of the car must not open it a second time
    standing = false,    -- the server only opens Whiplash for a car of a run
    run = function(car, _, info)
        if info.preview then return end   -- the world builder's copy of the car: nobody to open it for
        TriggerServerEvent('whip_autos:server:taskOpen', NetworkGetNetworkIdFromEntity(car))
    end,
})
