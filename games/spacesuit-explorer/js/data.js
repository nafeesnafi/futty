// Game content: astronauts, equipment, missions, checklists, encyclopedia and badges.
(function () {
  const SSE = window.SSE = window.SSE || {};

  SSE.STORE_KEY = 'fsg.spacesuit';

  SSE.AVATARS = [
    { id: 'ava', name: 'Ava', skin: '#f2c9a0', hair: '#5a3418', hairStyle: 'bun' },
    { id: 'leo', name: 'Leo', skin: '#8d5a3b', hair: '#1f140d', hairStyle: 'short' },
    { id: 'mia', name: 'Mia', skin: '#c68b5e', hair: '#2b1a10', hairStyle: 'long' },
    { id: 'sam', name: 'Sam', skin: '#e8b48a', hair: '#c9772f', hairStyle: 'curly' }
  ];

  // One item per slot. Order here is the order of the category tabs.
  SSE.SLOTS = [
    { id: 'suit', name: 'Suit', icon: '🧑‍🚀' },
    { id: 'helmet', name: 'Helmet', icon: '⛑️' },
    { id: 'comms', name: 'Comms', icon: '🎧' },
    { id: 'gloves', name: 'Gloves', icon: '🧤' },
    { id: 'boots', name: 'Boots', icon: '🥾' },
    { id: 'backpack', name: 'Life Support', icon: '🫧' },
    { id: 'tether', name: 'Tether', icon: '🔗' },
    { id: 'tool', name: 'Tools', icon: '🔧' },
    { id: 'protect', name: 'Protection', icon: '🛡️' }
  ];

  const PRESSURE_SUITS = ['eva-suit', 'lunar-suit', 'launch-suit', 'mars-suit'];

  // fits: suits this item can connect to (null = works with anything).
  // fake: not space equipment at all; always fails validation.
  SSE.ITEMS = [
    // Suits
    { id: 'eva-suit', slot: 'suit', name: 'EVA Spacesuit', fits: null,
      purpose: 'A spacesuit for spacewalks outside the space station. It is like a tiny spaceship you wear.',
      more: 'EVA means "extravehicular activity": going outside your spacecraft. NASA\'s EVA suit has many layers that hold air pressure, block heat and cold, and stop tiny bits of space dust.',
      inspect: { ok: 'Pressure check: suit holds its air ✓', bad: 'Pressure check: air slowly leaking from the waist ring', fix: 'You re-locked the waist ring. The suit holds its air now.' } },
    { id: 'lunar-suit', slot: 'suit', name: 'Moonwalker Suit', fits: null,
      purpose: 'A surface suit made for walking, bending and kneeling on the Moon.',
      more: 'Suits for the Moon need bendy hips and knees so astronauts can walk and pick up rocks. Their outer layers also have to stand up to sticky, scratchy Moon dust.',
      inspect: { ok: 'Knee joints bend smoothly ✓', bad: 'Knee joint is stiff with old dust', fix: 'You cleaned the joint. It bends smoothly now.' } },
    { id: 'launch-suit', slot: 'suit', name: 'Launch & Entry Suit', fits: null,
      purpose: 'A pressure suit worn inside the spacecraft during launch and return to Earth.',
      more: 'If the cabin ever lost air during launch or landing, this suit would keep the astronaut safe. It plugs into the spacecraft for air and cooling, so it cannot be used for spacewalks.',
      inspect: { ok: 'Zipper sealed, leak check passed ✓', bad: 'Leak check: the zipper is not fully closed', fix: 'You zipped it all the way. Leak check passed.' } },
    { id: 'station-clothes', slot: 'suit', name: 'Station Clothes', fits: null,
      purpose: 'Comfy shirt and pants with lots of pockets for everyday life inside the station.',
      more: 'Inside the space station the air is like the air on Earth, so astronauts wear ordinary clothes. Pockets and Velcro help stop things from floating away.',
      inspect: { ok: 'Pockets zipped, nothing floating away ✓', bad: 'A pocket is open and a pen is floating out', fix: 'You caught the pen and zipped the pocket.' } },
    { id: 'mars-suit', slot: 'suit', name: 'Concept Mars Suit', fits: null, concept: true,
      purpose: 'An imagined future suit for exploring Mars. Nobody has walked on Mars yet.',
      more: 'Engineers are still dreaming up Mars suits. Ideas include a back door you climb in through, tough dust-proof layers and joints made for long hikes.',
      inspect: { ok: 'Rear hatch sealed ✓', bad: 'Rear entry hatch is not latched', fix: 'You latched the rear hatch.' } },

    // Helmets
    { id: 'eva-helmet', slot: 'helmet', name: 'EVA Helmet & Gold Visor', fits: ['eva-suit'],
      purpose: 'A clear bubble helmet with a gold sun visor and lights for spacewalks.',
      more: 'Sunlight in space is very strong. A thin gold layer on the visor blocks much of the glare and heat. Helmet lights and cameras help in the dark part of each orbit.',
      inspect: { ok: 'Visor clear, lights working ✓', bad: 'Helmet light does not turn on', fix: 'You swapped in a fresh helmet light battery.' } },
    { id: 'lunar-helmet', slot: 'helmet', name: 'Moon Helmet with Lights', fits: ['lunar-suit'],
      purpose: 'A helmet for the Moon with sun visor and lights for dark crater shadows.',
      more: 'Near the Moon\'s south pole the Sun stays low, so shadows are long and very dark. Helmet lights help astronauts see where they step.',
      inspect: { ok: 'Visor scratch-free, lights bright ✓', bad: 'Sun visor has a dusty smear', fix: 'You wiped the visor with a soft cloth.' } },
    { id: 'launch-helmet', slot: 'helmet', name: 'Launch Helmet', fits: ['launch-suit'],
      purpose: 'A helmet that seals to the launch suit if the cabin loses pressure.',
      more: 'Launch helmets usually stay open so astronauts can talk and see clearly. The visor closes for launch and return, when the risk is highest.',
      inspect: { ok: 'Visor seal clicks shut ✓', bad: 'Visor latch does not click shut', fix: 'You re-seated the visor latch. Click!' } },
    { id: 'mars-helmet', slot: 'helmet', name: 'Concept Mars Helmet', fits: ['mars-suit'], concept: true,
      purpose: 'An imagined helmet with a wide view and a dust-shedding visor.',
      more: 'Mars dust is very fine and blows around in the wind. Future helmets may use special coatings so dust slides off.',
      inspect: { ok: 'Wide visor clear ✓', bad: 'Dust coating on the visor is scratched', fix: 'You fitted a fresh visor cover.' } },
    { id: 'bike-helmet', slot: 'helmet', name: 'Bike Helmet', fits: null, fake: true,
      purpose: 'Great for riding a bike on Earth!',
      more: 'A bike helmet has holes for air to flow through. In space there is no air outside, so a space helmet must be completely sealed.' },

    // Comms
    { id: 'comm-cap', slot: 'comms', name: 'Communications Cap', fits: PRESSURE_SUITS,
      purpose: 'A soft cap with headphones and microphones worn under the helmet.',
      more: 'Astronauts call it the "Snoopy cap" because it looks like the cartoon dog\'s ears. It lets them talk to Mission Control and their crewmates by radio.',
      inspect: { ok: 'Radio check: loud and clear ✓', bad: 'Radio check: crackly, one earphone is silent', fix: 'You plugged the cable back in. Loud and clear!' } },
    { id: 'headset', slot: 'comms', name: 'Station Headset', fits: ['station-clothes'],
      purpose: 'A light headset for talking with Mission Control from inside the station.',
      more: 'Inside the station, astronauts can just talk to each other. A headset helps when they call Mission Control or do interviews with schools on Earth.',
      inspect: { ok: 'Headset battery charged ✓', bad: 'Headset battery is flat', fix: 'You charged the headset.' } },

    // Gloves
    { id: 'eva-gloves', slot: 'gloves', name: 'EVA Gloves', fits: ['eva-suit', 'lunar-suit'],
      purpose: 'Tough pressurized gloves with grippy fingertips for working outside.',
      more: 'Spacewalk gloves are thick to protect from sharp edges, heat and cold, but they still need to let fingers grip tools. Some even have little heaters in the fingertips.',
      inspect: { ok: 'No cuts or worn spots ✓', bad: 'Worn spot on the index fingertip', fix: 'You swapped to a fresh pair of gloves.' } },
    { id: 'launch-gloves', slot: 'gloves', name: 'Launch Gloves', fits: ['launch-suit'],
      purpose: 'Gloves that lock to the launch suit and work with touch screens.',
      more: 'Modern spacecraft use touch screens, so launch gloves are made so astronauts can tap buttons while wearing them.',
      inspect: { ok: 'Wrist lock clicks in ✓', bad: 'Left wrist lock is not clicked in', fix: 'You clicked the wrist lock in place.' } },
    { id: 'mars-gloves', slot: 'gloves', name: 'Concept Mars Gloves', fits: ['mars-suit'], concept: true,
      purpose: 'Imagined gloves with dust-proof seams for digging and drilling.',
      more: 'Future gloves need to stay flexible for hours of fieldwork while keeping fine Martian dust out.',
      inspect: { ok: 'Dust seals intact ✓', bad: 'A dust seal is peeling', fix: 'You replaced the dust seal.' } },
    { id: 'mittens', slot: 'gloves', name: 'Winter Mittens', fits: null, fake: true,
      purpose: 'Cosy mittens for snowy days on Earth.',
      more: 'Mittens are warm, but they are not sealed. In space, gloves must hold air pressure and still let you grip tools.' },

    // Boots
    { id: 'eva-boots', slot: 'boots', name: 'EVA Boots', fits: ['eva-suit'],
      purpose: 'Boots that slide into foot restraints so you can work with both hands.',
      more: 'On a spacewalk you float, so you don\'t really walk! Astronauts lock their boots into foot restraints to stay steady while they work.',
      inspect: { ok: 'Boot plate fits the foot restraint ✓', bad: 'Boot plate clip is bent', fix: 'You swapped to a boot with a straight clip.' } },
    { id: 'moon-boots', slot: 'boots', name: 'Moon Boots', fits: ['lunar-suit'],
      purpose: 'Sturdy boots with grippy soles for walking on dusty, rocky ground.',
      more: 'The Moon has gravity (about one-sixth of Earth\'s), so astronauts really walk there. Strong soles and good grip help on loose dust and rocks.',
      inspect: { ok: 'Soles have good grip ✓', bad: 'Sole tread is packed with old dust', fix: 'You brushed out the tread.' } },
    { id: 'launch-boots', slot: 'boots', name: 'Launch Boots', fits: ['launch-suit'],
      purpose: 'Light boots that seal to the launch suit.',
      more: 'Launch boots are part of the pressure suit. They keep the suit sealed and are comfy enough for sitting for hours.',
      inspect: { ok: 'Boot seal locked ✓', bad: 'Right boot seal is unlocked', fix: 'You locked the boot seal.' } },
    { id: 'station-socks', slot: 'boots', name: 'Comfy Socks', fits: ['station-clothes'],
      purpose: 'Soft socks for floating around inside the station.',
      more: 'Astronauts on the station often just wear socks or soft shoes. They use foot loops on the floor to stay in place.',
      inspect: { ok: 'Socks are clean and dry ✓', bad: 'Socks are inside out', fix: 'You turned them the right way out.' } },
    { id: 'mars-boots', slot: 'boots', name: 'Concept Mars Boots', fits: ['mars-suit'], concept: true,
      purpose: 'Imagined hiking boots for long walks across Martian rocks and sand.',
      more: 'Mars explorers might walk many kilometers, so future boots need to be tough and comfortable.',
      inspect: { ok: 'Tread is deep and strong ✓', bad: 'Lace cover is loose', fix: 'You fastened the lace cover.' } },
    { id: 'rain-boots', slot: 'boots', name: 'Rain Boots', fits: null, fake: true,
      purpose: 'Perfect for jumping in puddles on Earth!',
      more: 'Rain boots keep out water, but they do not seal to a spacesuit or protect from extreme heat and cold.' },

    // Life support
    { id: 'pls', slot: 'backpack', name: 'Life-Support Backpack', fits: ['eva-suit', 'lunar-suit', 'mars-suit'],
      purpose: 'Gives you oxygen, removes the carbon dioxide you breathe out, keeps you cool and powers the suit.',
      more: 'NASA calls it the Portable Life Support System (PLSS). It pushes fresh oxygen around the suit, cleans out carbon dioxide, and pumps cool water through tubes in a special undergarment.',
      inspect: { ok: 'Oxygen tank: FULL (100%) ✓', bad: 'Oxygen tank: only 35% full', fix: 'You topped up the oxygen tank to 100%.' } },
    { id: 'suit-hose', slot: 'backpack', name: 'Spacecraft Air Hose', fits: ['launch-suit'],
      purpose: 'Connects your launch suit to the spacecraft for air and cooling.',
      more: 'Launch suits do not carry a backpack. Instead, a hose plugs the suit into the spacecraft, which supplies the air and cooling.',
      inspect: { ok: 'Hose connector clicks in firmly ✓', bad: 'Hose connector is loose', fix: 'You pushed the connector in until it clicked.' } },
    { id: 'scuba', slot: 'backpack', name: 'Scuba Tank', fits: null, fake: true,
      purpose: 'Used by divers to breathe underwater on Earth.',
      more: 'A scuba tank gives air, but it cannot remove carbon dioxide from a closed suit, keep you cool or power your radio. Space life support does all of these.' },

    // Tether
    { id: 'safety-tether', slot: 'tether', name: 'Safety Tether', fits: ['eva-suit'],
      purpose: 'A strong cable that clips you to the station so you can\'t float away.',
      more: 'During spacewalks, astronauts stay clipped to the station with safety tethers. They move one hook at a time so they are always attached.',
      inspect: { ok: 'Hook snaps shut and locks ✓', bad: 'Hook gate is stuck open', fix: 'You swapped to a hook that locks properly.' } },

    // Tools
    { id: 'power-tool', slot: 'tool', name: 'Spacewalk Power Tool', fits: null,
      purpose: 'A battery drill for turning bolts while you work outside.',
      more: 'NASA\'s pistol grip tool is like a drill made for spacewalks. Astronauts use it to loosen and tighten bolts when they fix or upgrade the station.',
      inspect: { ok: 'Battery charged ✓', bad: 'Battery is almost empty', fix: 'You put in a fully charged battery.' } },
    { id: 'sample-kit', slot: 'tool', name: 'Rock Sample Kit', fits: null,
      purpose: 'Tongs, a scoop and bags for collecting Moon rocks.',
      more: 'Moon rocks tell scientists how the Moon formed. Each sample goes into its own bag, labeled with where it was found.',
      inspect: { ok: 'Sample bags sealed and labeled ✓', bad: 'Sample bags are missing labels', fix: 'You added fresh labels.' } },
    { id: 'science-kit', slot: 'tool', name: 'Experiment Kit', fits: null,
      purpose: 'A tablet and containers for science experiments inside the station.',
      more: 'Astronauts run hundreds of experiments: growing plants, studying fire and fluids, and learning how bodies change in space.',
      inspect: { ok: 'Tablet charged, procedures loaded ✓', bad: 'Tablet is still loading old procedures', fix: 'You loaded today\'s procedures.' } },
    { id: 'mars-drill', slot: 'tool', name: 'Concept Core Drill & Scanner', fits: null, concept: true,
      purpose: 'An imagined drill and scanner to look for clues about water and ancient life.',
      more: 'Robots on Mars already drill rocks. Future human explorers may carry handheld tools to choose the most interesting places to dig.',
      inspect: { ok: 'Drill bit sharp, scanner on ✓', bad: 'Drill bit is blunt', fix: 'You fitted a sharp drill bit.' } },
    { id: 'cuff-checklist', slot: 'tool', name: 'Cuff Checklist', fits: null,
      purpose: 'A little booklet on your wrist with the steps for every warning.',
      more: 'Astronauts wear checklists on their wrists, like a tiny book. When something unexpected happens, they follow the steps instead of guessing.',
      inspect: { ok: 'All pages present ✓', bad: 'The warning-steps page is missing', fix: 'You added the missing page.' } },

    // Protection
    { id: 'safer', slot: 'protect', name: 'SAFER Jet Pack', fits: ['eva-suit'],
      purpose: 'A small emergency jet pack that could fly you back if your tether ever came loose.',
      more: 'SAFER stands for Simplified Aid For EVA Rescue. It fits on the bottom of the life-support backpack and is a backup, not a replacement for tethers.',
      inspect: { ok: 'Jet fuel: full ✓', bad: 'Jet fuel gauge: empty', fix: 'You refilled the jet pack.' } },
    { id: 'dust-kit', slot: 'protect', name: 'Dust Covers & Brush', fits: ['lunar-suit'],
      purpose: 'Covers and a brush to keep sharp Moon dust off your suit and out of the lander.',
      more: 'Moon dust is sharp like tiny bits of glass and sticks to everything. Apollo astronauts found it on their suits, tools and inside the lander.',
      inspect: { ok: 'Brush bristles soft and clean ✓', bad: 'Brush is clogged with old dust', fix: 'You cleaned the brush.' } },
    { id: 'seat-harness', slot: 'protect', name: 'Seat Harness', fits: ['launch-suit'],
      purpose: 'Seat straps that hold you snugly in your seat during launch and landing.',
      more: 'Launch and landing can be shaky, and the capsule pushes on you hard as it speeds up and slows down. The harness keeps you safely in your seat.',
      inspect: { ok: 'All 5 buckles click ✓', bad: 'One shoulder buckle does not click', fix: 'You cleared the buckle. Click!' } },
    { id: 'goggles', slot: 'protect', name: 'Safety Goggles', fits: null,
      purpose: 'Keep floating dust and droplets out of your eyes during some station tasks.',
      more: 'In microgravity dust doesn\'t fall to the floor, it floats! Astronauts wear goggles for jobs like cleaning air filters.',
      inspect: { ok: 'Lenses clear, strap snug ✓', bad: 'Goggle strap is snapped', fix: 'You fitted a new strap.' } },
    { id: 'mars-shield', slot: 'protect', name: 'Concept Dust-Storm Cover', fits: ['mars-suit'], concept: true,
      purpose: 'An imagined outer cover to help shield the suit from blowing Martian dust.',
      more: 'Martian dust storms can cover huge areas. Future suits will need extra protection to keep dust out of zips, joints and seals.',
      inspect: { ok: 'Cover fasteners closed ✓', bad: 'Cover fastener is torn', fix: 'You replaced the fastener.' } }
  ];

  SSE.item = (id) => SSE.ITEMS.find((i) => i.id === id);

  // Mission slot rules:
  //   need: [ids]      slot must hold one of these
  //   none: 'why'      slot must stay empty
  //   optional: [ids]  empty is fine, or one of these
  SSE.MISSIONS = [
    {
      id: 'spacewalk', num: 1, title: 'Spacewalk', place: 'International Space Station', difficulty: 2,
      color: '#7c5cff', lifeSupport: true,
      blurb: 'Float outside the space station and fix a broken solar panel.',
      objective: 'Learn why a spacewalk suit is like a tiny spaceship you wear.',
      brief: 'A solar panel on the space station needs a new part. You will go outside, clip on, move along the handrails and fix it!',
      slots: {
        suit: { need: ['eva-suit'] }, helmet: { need: ['eva-helmet'] }, comms: { need: ['comm-cap'] },
        gloves: { need: ['eva-gloves'] }, boots: { need: ['eva-boots'] }, backpack: { need: ['pls'] },
        tether: { need: ['safety-tether'] }, tool: { need: ['power-tool'] }, protect: { need: ['safer'] }
      },
      hints: {
        suit: 'Outside there is no air at all. Pick the suit made for spacewalks (EVA).',
        helmet: 'Choose the helmet that seals onto the EVA suit and blocks bright sunlight.',
        comms: 'You need to hear Mission Control. Something goes under your helmet…',
        gloves: 'Your hands need protection from sharp edges, heat and cold.',
        boots: 'Pick boots that lock into foot restraints on the station.',
        backpack: 'You need oxygen and a way to remove carbon dioxide. Look in Life Support.',
        tether: 'Something must keep you attached to the station at all times.',
        tool: 'You have bolts to turn on the solar panel.',
        protect: 'Pick the small emergency jet pack, a backup in case a tether ever comes loose.'
      },
      checklist: [
        { q: 'The airlock is open. What do you do before floating outside?', a: ['Clip my safety tether to a handrail', 'Push off and float out', 'Wave goodbye and jump'], ok: 0,
          why: 'Astronauts stay clipped to the station the whole time, so they can never drift away.' },
        { q: 'Your helmet visor has a shiny gold layer. What is it for?', a: ['Looking fancy for photos', 'Blocking bright sunlight and heat', 'Keeping my hair tidy'], ok: 1,
          why: 'Sunlight in space is very bright. The gold layer blocks much of the glare and heat.' },
        { q: 'How do you breathe during a spacewalk?', a: ['I hold my breath', 'I open my visor a little', 'Oxygen from my life-support backpack'], ok: 2,
          why: 'There is no air in space. The backpack supplies oxygen and removes the carbon dioxide you breathe out.' },
        { q: 'How do you talk to your crewmates outside?', a: ['By radio, through my communications cap', 'By shouting loudly', 'By writing notes'], ok: 0,
          why: 'Sound can\'t travel through empty space, so astronauts talk by radio.' }
      ],
      learn: 'An EVA suit protects you from no air, extreme heat and cold, and tiny space dust. Tethers keep you attached, and SAFER is only a backup.'
    },
    {
      id: 'lunar', num: 2, title: 'Lunar Explorer', place: 'The Moon', difficulty: 2,
      color: '#a8b3c7', lifeSupport: true,
      blurb: 'Walk on the Moon, plan a safe route and collect rock samples.',
      objective: 'Learn how Moon dust, extreme temperatures and limited oxygen shape a moonwalk.',
      brief: 'Your lander touched down near some interesting rocks. Collect 3 samples and get back before your oxygen gets low!',
      slots: {
        suit: { need: ['lunar-suit'] }, helmet: { need: ['lunar-helmet'] }, comms: { need: ['comm-cap'] },
        gloves: { need: ['eva-gloves'] }, boots: { need: ['moon-boots'] }, backpack: { need: ['pls'] },
        tether: { none: 'On the Moon, gravity keeps your feet on the ground and there is no station to clip onto. A tether would just get tangled.' },
        tool: { need: ['sample-kit'] }, protect: { need: ['dust-kit'] }
      },
      hints: {
        suit: 'You will walk, kneel and bend. Pick the suit made for the Moon\'s surface.',
        helmet: 'Crater shadows are very dark. Pick the Moon helmet with lights.',
        comms: 'Mission Control is far away. You still need your radio cap.',
        gloves: 'Moon rocks are sharp. Pick tough gloves that fit the Moon suit.',
        boots: 'You will really walk here! Pick boots with grippy soles.',
        backpack: 'There is no air on the Moon. You need oxygen and carbon dioxide removal.',
        tether: 'Think: is there anything to clip onto on the Moon? Do you need a tether there?',
        tool: 'Your job is to collect rocks.',
        protect: 'Moon dust is sharp and sticky. Pick something to keep it off.'
      },
      checklist: [
        { q: 'Moon dust is sharp and sticky. What do you do before going back into the lander?', a: ['Brush the dust off my suit', 'Nothing, dust is harmless', 'Rub it into the seats'], ok: 0,
          why: 'Moon dust can scratch seals and get into machines. Brushing it off keeps the lander clean.' },
        { q: 'In sunlight the Moon\'s ground can be hotter than boiling water, and in shadow much colder than a freezer. What protects you?', a: ['A thick coat', 'My suit\'s insulation layers and cooling system', 'Walking really fast'], ok: 1,
          why: 'The Moon has no air to spread heat around. Suit layers and cooling keep you comfortable.' },
        { q: 'Your oxygen is limited. When should you head back?', a: ['Only when it is completely empty', 'When I reach my turn-around amount, even if I am not finished', 'Whenever I feel like it'], ok: 1,
          why: 'Explorers plan a turn-around point, so there is always enough oxygen to get home safely.' },
        { q: 'Which route is safest?', a: ['Straight through a big crater', 'Around craters and steep slopes', 'Jumping over boulders'], ok: 1,
          why: 'Going around craters avoids steep slopes, loose rocks and very cold shadows.' }
      ],
      learn: 'Moon suits are made for walking. Moon dust, big temperature swings and limited oxygen mean every moonwalk needs a careful plan.'
    },
    {
      id: 'launch', num: 3, title: 'Launch & Return', place: 'Spacecraft cabin', difficulty: 2,
      color: '#ff8a3d', lifeSupport: true,
      blurb: 'Suit up, plug in and buckle up for launch and the ride home.',
      objective: 'Learn why launch-and-entry suits and spacewalk suits do different jobs.',
      brief: 'Your capsule launches today! Get into your launch-and-entry suit, connect it to the spacecraft and buckle in. Then ride home safely.',
      slots: {
        suit: { need: ['launch-suit'] }, helmet: { need: ['launch-helmet'] }, comms: { need: ['comm-cap'] },
        gloves: { need: ['launch-gloves'] }, boots: { need: ['launch-boots'] }, backpack: { need: ['suit-hose'] },
        tether: { none: 'Inside the capsule, your seat harness holds you in place. A tether is for spacewalks.' },
        tool: { none: 'Keep your hands free for the touch screens. Loose tools could float around the cabin.' },
        protect: { need: ['seat-harness'] }
      },
      hints: {
        suit: 'You stay inside the capsule. Pick the suit worn during launch and return.',
        helmet: 'Pick the helmet that seals onto the launch suit.',
        comms: 'You must hear the countdown and Mission Control.',
        gloves: 'Pick gloves that lock to the launch suit and work with touch screens.',
        boots: 'Pick boots that seal to the launch suit.',
        backpack: 'A launch suit doesn\'t carry a backpack. It plugs into the spacecraft instead.',
        tether: 'Are you going outside? You are strapped into a seat.',
        tool: 'During launch your hands should be free.',
        protect: 'What keeps you snugly in your seat while the capsule shakes?'
      },
      checklist: [
        { q: 'Why do astronauts wear a launch-and-entry suit?', a: ['To walk on the Moon', 'To protect them if the cabin loses air during launch or return', 'Because it\'s comfy pajamas'], ok: 1,
          why: 'Launch and return are busy, shaky times. The suit is there in case the cabin ever loses air pressure.' },
        { q: 'Could you do a spacewalk in a launch-and-entry suit?', a: ['Yes, it\'s the same suit', 'No, it has no backpack and needs the spacecraft\'s air hose', 'Only on Tuesdays'], ok: 1,
          why: 'Launch suits plug into the spacecraft. Spacewalk suits carry their own life support in a backpack.' },
        { q: 'When should your seat harness be buckled?', a: ['Snug and tight before launch and before return', 'Loose, so I can wiggle', 'Only after landing'], ok: 0,
          why: 'The harness keeps you safely in your seat during the shakiest parts of the flight.' },
        { q: 'What does the suit\'s air hose connect to?', a: ['A scuba tank', 'Nothing, it\'s decoration', 'The spacecraft, which supplies air and cooling'], ok: 2,
          why: 'The spacecraft supplies the suit with air and cooling through the hose.' }
      ],
      learn: 'Launch-and-entry suits protect you inside the spacecraft and plug into it. EVA suits are for going outside and carry their own life support.'
    },
    {
      id: 'orbit', num: 4, title: 'Life in Orbit', place: 'Inside the space station', difficulty: 1,
      color: '#2fd3c4', lifeSupport: false,
      blurb: 'Do science, clean an air filter and float around the station.',
      objective: 'Learn that astronauts wear ordinary clothes inside the station.',
      brief: 'Today is a work day inside the station: clean a dusty air filter, water the plant experiment and do your exercise.',
      slots: {
        suit: { need: ['station-clothes'] },
        helmet: { none: 'The station is filled with air like on Earth, so you can breathe without a helmet.' },
        comms: { optional: ['headset'] },
        gloves: { none: 'Inside, bare hands are best for careful science work.' },
        boots: { optional: ['station-socks'] },
        backpack: { none: 'The station\'s own life-support system cleans the air for everyone.' },
        tether: { none: 'Inside the station you use handrails and foot loops instead.' },
        tool: { need: ['science-kit'] }, protect: { need: ['goggles'] }
      },
      hints: {
        suit: 'Inside, the air is like on Earth. Do you need a big suit?',
        helmet: 'Can you breathe the station\'s air? Then no helmet is needed.',
        comms: 'A headset is handy, but not required.',
        gloves: 'For careful science, bare hands work best.',
        boots: 'Socks are comfy, but not required.',
        backpack: 'The station already makes and cleans the air.',
        tether: 'You are inside. Handrails and foot loops keep you in place.',
        tool: 'You will do experiments today.',
        protect: 'Dust floats in microgravity. What protects your eyes while you clean the filter?'
      },
      checklist: [
        { q: 'Do astronauts wear spacesuits all day on the space station?', a: ['Yes, always', 'No, inside they wear ordinary clothes', 'Only when sleeping'], ok: 1,
          why: 'The station is filled with air at a comfortable pressure, so normal clothes are fine.' },
        { q: 'You\'re cleaning a dusty air filter. What do you add?', a: ['Safety goggles, so floating dust stays out of my eyes', 'A full spacewalk suit', 'Nothing at all'], ok: 0,
          why: 'Only add protective gear when the task needs it. Floating dust and eyes don\'t mix!' },
        { q: 'How do you stay in one place while you work?', a: ['Super glue', 'Foot loops and handrails', 'A safety tether to the outside'], ok: 1,
          why: 'Foot loops and handrails inside the station help astronauts stay steady.' },
        { q: 'Who keeps the station\'s air fresh?', a: ['The station\'s life-support system', 'Open windows', 'Each astronaut\'s backpack'], ok: 0,
          why: 'The station\'s life-support system adds oxygen and removes carbon dioxide for the whole crew.' }
      ],
      learn: 'Astronauts don\'t wear bulky suits all the time. Inside the station, ordinary clothes plus task-specific protection, like goggles, are enough.'
    },
    {
      id: 'mars', num: 5, title: 'Mars Research', place: 'Mars (imagined future)', difficulty: 3, concept: true,
      color: '#e2593b', lifeSupport: true,
      blurb: 'Imagine a future mission: explore Mars and look for clues about water.',
      objective: 'Think like an engineer about what future Mars explorers might need.',
      brief: 'HYPOTHETICAL FUTURE MISSION: no astronaut has visited Mars yet. Imagine you are one of the first explorers. Choose your concept gear, scan rocks for clues and watch out for dust storms!',
      slots: {
        suit: { need: ['mars-suit'] }, helmet: { need: ['mars-helmet'] }, comms: { need: ['comm-cap'] },
        gloves: { need: ['mars-gloves'] }, boots: { need: ['mars-boots'] }, backpack: { need: ['pls'] },
        tether: { none: 'Mars has gravity and no station to clip onto, so a tether isn\'t needed.' },
        tool: { need: ['mars-drill'] }, protect: { need: ['mars-shield'] }
      },
      hints: {
        suit: 'Look for the items marked CONCEPT. They are imagined designs for Mars.',
        helmet: 'Pick the concept helmet that fits the Mars suit.',
        comms: 'You will still talk by radio with your crew.',
        gloves: 'Pick the concept gloves with dust-proof seams.',
        boots: 'Long hikes! Pick the concept Mars boots.',
        backpack: 'Mars air is too thin and mostly carbon dioxide. You need life support.',
        tether: 'Like the Moon, Mars has gravity. Is a tether needed?',
        tool: 'You will scan and drill rocks.',
        protect: 'Martian dust blows everywhere. Pick the concept cover.'
      },
      checklist: [
        { q: 'Has any astronaut walked on Mars yet?', a: ['Yes, lots of times', 'Not yet. This is an imagined future mission', 'Only on weekends'], ok: 1,
          why: 'Robots and rovers explore Mars today. Human missions are a future goal.' },
        { q: 'What is the air on Mars like?', a: ['Just like Earth\'s', 'Very thin and mostly carbon dioxide, so you can\'t breathe it', 'Made of candy floss'], ok: 1,
          why: 'Mars air is very thin and mostly carbon dioxide, so explorers would need life support.' },
        { q: 'A radio message from Mars to Earth takes…', a: ['Several minutes, so the crew must solve many problems themselves', 'No time at all', 'Exactly one year'], ok: 0,
          why: 'Depending on where the planets are, a message takes about 3 to 22 minutes each way.' },
        { q: 'Mission Control spots a dust storm coming. What do you do?', a: ['Keep exploring, it\'s only dust', 'Head back to the habitat early', 'Take off my helmet to look'], ok: 1,
          why: 'Dust storms can cover huge areas. Heading back early is the safe choice.' }
      ],
      learn: 'Mars missions are still a future goal. Engineers imagine suits that handle dust, cold, thin air and long hikes. Maybe you will help design one!'
    },
    {
      id: 'emergency', num: 6, title: 'Emergency Training', place: 'Training simulator', difficulty: 3,
      color: '#ffcc4d', lifeSupport: true,
      blurb: 'Practice a spacewalk in the simulator and handle warning lights.',
      objective: 'Learn to stop, find the warning, check the checklist and choose the right response.',
      brief: 'This is a practice run in the training simulator: nothing here is real. Warning lights will pop up. Stop, find the warning, check your cuff checklist and choose what to do.',
      slots: {
        suit: { need: ['eva-suit'] }, helmet: { need: ['eva-helmet'] }, comms: { need: ['comm-cap'] },
        gloves: { need: ['eva-gloves'] }, boots: { need: ['eva-boots'] }, backpack: { need: ['pls'] },
        tether: { need: ['safety-tether'] }, tool: { need: ['cuff-checklist'] }, protect: { need: ['safer'] }
      },
      hints: {
        suit: 'You are practicing a spacewalk. Pick the EVA suit.',
        helmet: 'Pick the helmet that seals onto the EVA suit.',
        comms: 'You must hear the trainers, so wear the radio cap.',
        gloves: 'Pick the EVA gloves.',
        boots: 'Pick the boots that lock into foot restraints.',
        backpack: 'Life support is needed for a spacewalk, even a practice one.',
        tether: 'Stay attached, just like a real spacewalk.',
        tool: 'You will need the steps for each warning. Something you wear on your wrist…',
        protect: 'Pick the backup jet pack used on real spacewalks.'
      },
      checklist: [
        { q: 'A warning light turns on. What is the FIRST thing you do?', a: ['Keep working, it\'s probably nothing', 'Stop what I\'m doing and tell Mission Control', 'Turn off the light'], ok: 1,
          why: 'Stop first. Then you can think clearly and get help.' },
        { q: 'Where do you find the steps for each warning?', a: ['I guess', 'My cuff checklist', 'I ask a passing satellite'], ok: 1,
          why: 'Checklists have tested steps for each warning, so nobody has to guess.' },
        { q: 'Is it okay to ignore a warning if you\'re nearly finished?', a: ['Yes, finishing is most important', 'No, safety always comes first', 'Only if no one is watching'], ok: 1,
          why: 'Jobs can wait. Safety can\'t.' },
        { q: 'Who can help you when a warning comes up?', a: ['My spacewalk buddy and Mission Control', 'Nobody', 'Only aliens'], ok: 0,
          why: 'Astronauts work as a team with their buddy and Mission Control.' }
      ],
      learn: 'When a warning appears: stop, identify it, check the checklist, then respond. This is how real crews stay calm and safe. (This game is a simulation, not real training.)'
    }
  ];

  SSE.mission = (id) => SSE.MISSIONS.find((m) => m.id === id);

  SSE.BADGES = [
    { id: 'first', name: 'First Mission', icon: '🚀', desc: 'Complete your first mission.' },
    { id: 'oxygen', name: 'Oxygen Expert', icon: '🫧', desc: 'Complete 3 missions that need a life-support system.' },
    { id: 'safety', name: 'Safety Champion', icon: '🛡️', desc: 'Complete Emergency Training.' },
    { id: 'spacewalk', name: 'Spacewalk Specialist', icon: '🛰️', desc: 'Complete the Spacewalk mission.' },
    { id: 'lunar', name: 'Lunar Explorer', icon: '🌕', desc: 'Complete the Lunar Explorer mission.' },
    { id: 'commander', name: 'Mission Commander', icon: '🎖️', desc: 'Complete all 6 missions.' },
    { id: 'perfect', name: 'Perfect Prep', icon: '✨', desc: 'Pass "Check My Suit" on the first try.' },
    { id: 'fixer', name: 'Quick Fixer', icon: '🔧', desc: 'Fix your outfit after a failed suit check.' },
    { id: 'future', name: 'Future Thinker', icon: '🔴', desc: 'Complete the Mars Research concept mission.' },
    { id: 'bookworm', name: 'Space Bookworm', icon: '📚', desc: 'Read 5 encyclopedia topics.' }
  ];

  const SRC = {
    suitK4: { t: 'NASA: What Is a Spacesuit? (Grades K-4)', u: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-a-spacesuit-grades-k-4/' },
    suit58: { t: 'NASA: What Is a Spacesuit? (Grades 5-8)', u: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-a-spacesuit-grades-5-8/' },
    walkK4: { t: 'NASA: What Is a Spacewalk? (Grades K-4)', u: 'https://www.nasa.gov/learning-resources/for-kids-and-students/what-is-a-spacewalk-grades-k-4/' },
    eva: { t: 'NASA: EVA Systems', u: 'https://www.nasa.gov/reference/jsc-eva-systems/' },
    artemis: { t: 'NASA: Artemis Generation Spacesuits Activity', u: 'https://www.nasa.gov/stem-content/artemis-generation-spacesuits-activity/' }
  };

  SSE.TOPICS = [
    { id: 'what', icon: '🧑‍🚀', title: 'What is a spacesuit?',
      text: 'A spacesuit is like a tiny, personal spaceship. It gives astronauts air to breathe, keeps them at a safe temperature and protects them from the dangers of space.',
      more: 'NASA\'s spacewalk suit has many layers. Some hold in air, some block heat and cold, and the outside layers protect against tiny fast-moving bits of dust and debris.',
      src: [SRC.suitK4, SRC.suit58] },
    { id: 'pressure', icon: '🎈', title: 'Why pressure matters',
      text: 'On Earth, the air around us gently presses on our bodies all the time. Space has no air, so a spacesuit is filled with air to press on your body the same way.',
      more: 'Without that pressure, the body cannot work properly. That is why a suit must be completely sealed, from helmet to gloves to boots. One loose seal and the air leaks out.',
      src: [SRC.suit58] },
    { id: 'breathe', icon: '🫁', title: 'How astronauts breathe',
      text: 'The life-support backpack supplies oxygen. A fan moves it through the suit so the astronaut can breathe.',
      more: 'Before some spacewalks, astronauts breathe pure oxygen for a while to help their bodies get ready for the lower pressure inside the suit.',
      src: [SRC.suitK4, SRC.walkK4] },
    { id: 'co2', icon: '♻️', title: 'Removing carbon dioxide',
      text: 'Every time you breathe out, you make carbon dioxide. In a closed suit it would build up, so the backpack removes it.',
      more: 'The life-support system pulls carbon dioxide out of the air and sends fresh oxygen back to the astronaut. This is why a scuba tank wouldn\'t work in space: it gives air, but does not clean it.',
      src: [SRC.suitK4, SRC.eva] },
    { id: 'temp', icon: '🌡️', title: 'Staying cool and warm',
      text: 'In sunlight things in space get very hot, and in shadow they get very cold. Suit layers act like a thermos to block heat and cold.',
      more: 'Astronauts wear a special undergarment with thin tubes of cool water running through it. The backpack pumps the water to carry away body heat, so they don\'t overheat while they work.',
      src: [SRC.suitK4, SRC.eva] },
    { id: 'parts', icon: '⛑️', title: 'Helmets, visors, gloves and boots',
      text: 'The helmet holds in air and lets you see. A gold visor blocks bright sunlight. Gloves protect hands but still let you grip. Boots protect your feet.',
      more: 'Gloves are one of the hardest parts to design: they must hold air pressure and protect against sharp edges, but stay bendy enough to use tools. On spacewalks, boots lock into foot restraints. On the Moon, boots need grip for walking.',
      src: [SRC.suitK4, SRC.suit58] },
    { id: 'tether', icon: '🔗', title: 'Why tethers matter',
      text: 'During a spacewalk, astronauts float. Safety tethers clip them to the station so they cannot drift away.',
      more: 'Astronauts move hand over hand along handrails and always keep a tether attached. A small jet pack called SAFER is a backup in case a tether ever came loose. On the Moon and Mars gravity keeps you on the ground, so tethers aren\'t used the same way.',
      src: [SRC.walkK4, SRC.eva] },
    { id: 'types', icon: '👕', title: 'Different suits for different jobs',
      text: 'EVA suits are for going outside. Launch-and-entry suits are worn inside the spacecraft during launch and return. Inside the station, astronauts wear ordinary clothes.',
      more: 'A launch-and-entry suit plugs into the spacecraft for air and cooling, so it can\'t be used outside. An EVA suit carries its own life support. On the station, the air is like on Earth, so everyday clothes are best.',
      src: [SRC.suit58, SRC.artemis] },
    { id: 'missions', icon: '🗺️', title: 'Why gear changes by mission',
      text: 'Every place is different: floating outside the station, walking on the dusty Moon, riding a rocket or working inside. Each job needs the right gear, and nothing extra.',
      more: 'Extra gear adds weight and can get in the way. Missing gear can make a job unsafe. Engineers and astronauts check every item against the mission plan. That\'s what you practice in this game!',
      src: [SRC.artemis, SRC.suit58] }
  ];
})();
