// Mission readiness: checks an outfit (slot -> item id) against a mission's rules.
(function () {
  const SSE = window.SSE = window.SSE || {};

  const WHY = {
    suit: 'The suit is the main protection: it holds air pressure and blocks heat and cold.',
    helmet: 'The helmet seals in your air and protects your eyes from bright sunlight.',
    comms: 'Without radio you can\'t hear Mission Control or your crew.',
    gloves: 'Without the right gloves, the suit isn\'t sealed and your hands aren\'t protected.',
    boots: 'Boots finish the suit\'s seal and protect your feet.',
    backpack: 'Life support gives you oxygen, removes carbon dioxide and keeps you cool. You can\'t go without it!',
    tether: 'A tether keeps you attached so you can\'t float away.',
    tool: 'You need the right tool to do the mission\'s job.',
    protect: 'This mission needs extra protection for its special dangers.'
  };

  // Returns { status, message, hint } for one slot.
  // status: 'ok' | 'missing' | 'wrong' | 'extra' | 'fake' | 'incompatible' | 'empty-ok'
  function checkSlot(mission, slotId, outfit) {
    const rule = mission.slots[slotId];
    const id = outfit[slotId];
    const item = id ? SSE.item(id) : null;
    const suit = outfit.suit ? SSE.item(outfit.suit) : null;

    if (!item) {
      if (rule.need) return { status: 'missing', message: `No ${slotName(slotId).toLowerCase()} equipped. ${WHY[slotId]}`, hint: mission.hints[slotId] };
      return { status: 'empty-ok', message: rule.none || 'Not needed for this mission.' };
    }
    if (item.fake) return { status: 'fake', message: `${item.name} is not space equipment. ${item.more}`, hint: rule.none ? 'Take it off: this slot can stay empty.' : mission.hints[slotId] };
    if (rule.none) return { status: 'extra', message: `${item.name} is not needed here. ${rule.none}`, hint: 'Take it off: this slot can stay empty on this mission.' };
    const allowed = rule.need || rule.optional;
    if (!allowed.includes(item.id)) return { status: 'wrong', message: `${item.name} is not right for ${mission.title}. ${WHY[slotId]}`, hint: mission.hints[slotId] };
    if (item.fits && (!suit || !item.fits.includes(suit.id))) {
      return { status: 'incompatible', message: suit
        ? `${item.name} can't connect to the ${suit.name}. Parts must match the suit they lock onto.`
        : `${item.name} needs a suit to lock onto. Put on the right suit first.`, hint: mission.hints.suit };
    }
    return { status: 'ok', message: item.purpose };
  }

  function slotName(slotId) { return SSE.SLOTS.find((s) => s.id === slotId).name; }

  // Full validation. readiness is the share of slots that are correct, so any
  // problem keeps it below 100 and `ready` is only true with zero problems.
  SSE.validate = function (missionId, outfit) {
    const mission = SSE.mission(missionId);
    const slots = {};
    const problems = [];
    let good = 0;
    for (const s of SSE.SLOTS) {
      const r = checkSlot(mission, s.id, outfit);
      slots[s.id] = r;
      if (r.status === 'ok' || r.status === 'empty-ok') good++;
      else problems.push({ slot: s.id, ...r });
    }
    return { ready: problems.length === 0, readiness: Math.round((good / SSE.SLOTS.length) * 100), slots, problems };
  };

  // How an item relates to a mission, for the item info panel.
  SSE.compat = function (missionId, outfit, itemId) {
    const item = SSE.item(itemId);
    const trial = { ...outfit, [item.slot]: item.id };
    const r = checkSlot(SSE.mission(missionId), item.slot, trial);
    if (r.status === 'ok') return { tone: 'good', text: 'Good choice for this mission.' };
    if (r.status === 'incompatible') return { tone: 'warn', text: r.message };
    if (r.status === 'extra') return { tone: 'warn', text: 'Not needed for this mission.' };
    if (r.status === 'fake') return { tone: 'bad', text: 'Not space equipment!' };
    return { tone: 'bad', text: 'Not right for this mission.' };
  };

  if (typeof module !== 'undefined') module.exports = SSE;
})();
