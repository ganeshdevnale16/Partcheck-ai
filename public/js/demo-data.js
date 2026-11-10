/* Inspection AI – DEMO DATA
   Everything the demo needs to look and behave like the real product without an AI backend:
   - inspection types (same checklists as the real app)
   - real scaffold photos (Wikimedia Commons) for a PASS and a FAIL scenario
   - the scripted AI findings for each scenario (evidence, confidence, boxes on the photo)
   - seeded QR tags and two sample reports
   Replace any photo by putting a file with the same name in /public/demo/images (see README). */
(() => {
  'use strict';

  // ---------- real demo photos ----------
  // path = Wikimedia upload path (md5 folder + file). The app tries: local copy -> Wikimedia thumbnail -> Special:FilePath -> drawn fallback.
  const COMMONS = {
    'p-base':   { file: 'Metal scaffolding at WP Welding 2.jpg', path: '7/70/Metal_scaffolding_at_WP_Welding_2.jpg' },
    'p-elev':   { file: 'Scaffolded building, Sheffield - DSC07492.JPG', path: '0/0e/Scaffolded_building%2C_Sheffield_-_DSC07492.JPG' },
    'p-plat':   { file: 'A building frame with scaffolding at a construction site with blue sky in background.jpg', path: '3/3c/A_building_frame_with_scaffolding_at_a_construction_site_with_blue_sky_in_background.jpg' },
    'p-ladder': { file: 'Bouwsteiger 001.jpg', path: '8/83/Bouwsteiger_001.jpg' },
    'f-base':   { file: 'Nunobikicho scaffolding accident.JPG', path: 'b/b8/Nunobikicho_scaffolding_accident.JPG' },
    'f-elev':   { file: 'Building Under Construction 02.JPG', path: '6/6d/Building_Under_Construction_02.JPG' },
    'f-plat':   { file: '11 Manila Makati - high rise construction scaffolding and protective netting.jpg', path: '1/1a/11_Manila_Makati_-_high_rise_construction_scaffolding_and_protective_netting.jpg' },
    'f-ladder': { file: 'Orion Building scaffolding.JPG', path: '4/41/Orion_Building_scaffolding.JPG' },
    'x-site':   { file: 'London Scaffolding At Tate Modern (142728139).jpeg', path: 'a/a2/London_Scaffolding_At_Tate_Modern_%28142728139%29.jpeg' },
    'x-net':    { file: 'Manila, City of Makati - construction scaffolding and protective platic net.jpg', path: 'b/b5/Manila%2C_City_of_Makati_-_construction_scaffolding_and_protective_platic_net.jpg' },
  };
  // real site photos supplied by the client (public/demo/images)
  const LOCAL = { 's-base': 'site-base.jpg', 's-elev': 'site-elev.jpg', 's-plat': 'site-plat.jpg', 's-ladder': 'site-ladder.jpg' };
  // tag close-ups are drawn by the app (media.js) so they show the right tag ID and date
  const GENERATED = { 'p-tag': 'tag-pass', 'f-tag': 'tag-fail' };

  // ---------- inspection types ----------
  // Scaffold systems. A check line can end with "@tube,cuplock,..." = applies only to those systems (others: Not applicable).
  // A line starting with "?" = optional component: if it is not there, the check is Not applicable instead of Not provided.
  const SCAFFOLD_TYPES = [
    { key: 'tube', label: 'Tube & coupler', hint: 'Loose tubes joined with couplers / clamps' },
    { key: 'cuplock', label: 'Cup-lock', hint: 'Cup joints on the standards; ledger blades locked by a top cup' },
    { key: 'ringlock', label: 'Ring-lock', hint: 'Rosettes (round plates with holes) on the standards; wedge clamps' },
    { key: 'mobile', label: 'Mobile tower', hint: 'Fabricated / aluminium frames on castor wheels' },
    { key: 'frame', label: 'Frame (H-frame)', hint: 'Prefabricated H-frames with cross braces and coupling pins' },
  ];
  // Photo guidance per system for the views where it matters
  const SCAFFOLD_GUIDANCE = {
    'Base & foundation': {
      tube: 'Low angle: every standard, its base plate and the ground under it', cuplock: 'Low angle: the bottom of every standard, base jacks / plates and the ground',
      ringlock: 'Low angle: base collars, base jacks and the ground under them', mobile: 'Every castor with its brake, the outriggers and the floor',
      frame: 'Low angle: frame legs, base jacks / plates and the ground',
    },
    'Joints & members (close-up)': {
      tube: 'Close-up of 2-3 couplers and the tubes around them (rust, bends)', cuplock: 'Close-up of 2-3 cup joints: the top cup must sit down over the ledger blades',
      ringlock: 'Close-up of 2-3 rosettes: the wedges must be driven down tight', mobile: 'Close-up of frame locks / pins and the brace hooks',
      frame: 'Close-up of coupling pins, cross-brace locks and frame joints',
    },
  };
  const ALL_RIGID = '@tube,cuplock,ringlock,frame';
  const SCAFFOLD = {
    id: 'type-scaffold', builtin: true, rev: 3, module: 'scaffold', safety: true,
    name: 'Scaffold', description: 'Access scaffold – choose the system (tube & coupler, cup-lock, ring-lock, mobile tower, frame); checks adapt to it',
    idLabel: 'Scaffold ID / tag no.',
    angles: [
      { name: 'Base & foundation', guidance: 'Low angle along the bottom: all uprights, base plates and the ground', parts: [
        `! Base plates :: a base plate (or base jack plate) under every standard ${ALL_RIGID}`,
        `? Base jacks :: adjustable base jacks not bent, not over-extended, no heavy rust on the thread ${ALL_RIGID}`,
        `! Sole boards / firm ground :: first identify the surface. Level concrete slab: base plates directly on it are acceptable. Soil or soft ground: timber sole boards required. Bricks, blocks or loose packing under a base are a defect ${ALL_RIGID}`,
        '! Castors locked :: every castor wheel has its brake locked and is undamaged @mobile',
        '! Outriggers / stabilisers :: outriggers fitted where required and resting on the floor @mobile',
        'Standards plumb :: uprights look vertical, not leaning, bent or sinking',
      ] },
      { name: 'Full elevation', guidance: 'Step back and capture the whole face from bottom to top', parts: [
        '! Ledgers and transoms :: horizontal members present at every lift, none missing (a top lift used as the working platform may have no transom) @tube,cuplock,ringlock',
        '! Bracing :: diagonal braces fixed between standards along the scaffold face (raking props, wire ropes and cables are NOT bracing)',
        `! Ties to structure :: scaffold tied to the building / structure at regular intervals ${ALL_RIGID}`,
        '! Height-to-base ratio :: tower height not more than about 3 times its smallest base width (outriggers included) @mobile',
      ] },
      { name: 'Working platform', guidance: 'At platform level: deck, edges and rails in view', parts: [
        '! Platform fully boarded :: boards or decks cover the full width, no gaps, broken or loose boards',
        '! Top rail :: top rail at about 1 m on every open side (top rail + mid rail + toe board = guardrail)',
        '! Mid rail :: mid rail between the top rail and the toe board on every open side',
        '! Toe boards :: toe boards fitted along every open edge of the platform',
        'Platform clear :: no heavy stacks of material, debris or trip hazards on the platform',
      ] },
      { name: 'Access ladder', guidance: 'The ladder and the landing where it reaches the platform', parts: [
        '! Access ladder :: a ladder or stair gives safe access: tied / secured, lands on a proper landing platform and extends about 1 m above it',
      ] },
      { name: 'Joints & members (close-up)', guidance: 'Close-up of joints and members: couplers / cups / rosettes, rust and damage', parts: [
        '! Couplers / clamps :: couplers fitted at the joints, none missing or hanging loose @tube',
        '! System joints locked :: cup-lock: top cups locked down over the ledger blades; ring-lock: wedges driven tight; frame / mobile: coupling pins and locks engaged @cuplock,ringlock,frame,mobile',
        'Tube condition :: light surface rust is acceptable; heavy rust, flaking, pitting, bent, cracked or crushed members are a defect',
      ] },
      { name: 'Scaffold tag', guidance: 'Close-up of the tag or status board at the access point', parts: [
        'Scaffold tag :: an inspection tag or status board is displayed at the access point',
      ] },
    ],
    general_parts: [],
  };

  const FSSAI = {
    id: 'type-fssai', builtin: true, module: '', safety: false,
    name: 'FSSAI food safety audit',
    description: 'Hotel / restaurant kitchen food safety audit – 77 checks from the Food Safety Inspection Checklist (FSSAI). Photograph documents for record checks and probe readings for temperatures.',
    idLabel: 'FSSAI licence no.',
    angles: [
      { name: "Licence & records", guidance: "Photograph the FSSAI licence, the display board and each document or register below, text readable.", parts: [
        "FSSAI licence valid :: Licence or registration is valid (not expired) and matches these premises and food activities (A01)",
        "Licence and display board shown :: Licence and Food Safety Display Board displayed in a visible place where required (A02)",
        "FSMS plan available :: Current documented FSMS / HACCP plan covering the actual kitchen processes (A03)",
        "Food safety roles assigned :: Chart or document names the owners for food safety, monitoring and escalation (A04)",
        "Food safety records maintained :: Records complete, legible, dated and signed, with no gaps (A05)",
        "Compliance register up to date :: Register lists licence conditions and notices with evidence of closure (A06)"
      ] },
      { name: "Premises & facilities", guidance: "Wide photos of the kitchen, then close-ups of hand-wash sinks, toilets, lights, water point and chemical store.", parts: [
        "Raw and ready-to-eat areas separated :: Layout keeps raw food handling physically apart from ready-to-eat preparation (B01)",
        "Floors, walls and ceilings in good repair :: Surfaces intact and cleanable; no flaking paint, cracks, leaks or mould (B02)",
        "Drainage and ventilation working :: Exhaust hoods and drains clean; no standing water or condensation over food (B03)",
        "Lights protected :: Lighting adequate; bulbs and tubes over food areas have covers or shatter-proof fittings (B04)",
        "Hand-wash stations equipped :: Hand-wash sink accessible with running water, soap and paper towels or dryer (B05)",
        "Toilets clean and separated :: Toilets and changing rooms clean and not opening directly into food areas (B06)",
        "Food-contact equipment in good condition :: Utensils, containers and worktops food-grade, intact and clean; no rust or cracks (B07)",
        "! Potable water and ice :: Potable water source used for food and ice; current water test report shows it is safe (B08)",
        "Chemicals stored away from food :: Cleaning chemicals labelled and kept in a separate area away from food and utensils (B09)"
      ] },
      { name: "Receiving", guidance: "At the receiving point: goods being checked, the probe thermometer reading, the reject area and the delivery vehicle.", parts: [
        "Approved supplier list :: Approved supplier list with each supplier's FSSAI licence number (C01)",
        "Incoming goods checked :: Delivered items undamaged, within expiry date, labelled and free of contamination (C02)",
        "! Delivery temperatures checked :: Probe reading shows chilled ≤5°C and frozen ≤−18°C at receipt, written in the log (C03)",
        "! Rejected items segregated :: Rejected, expired or damaged items clearly marked and kept apart from usable stock (C04)",
        "Batches traceable :: Invoice or receiving record links supplier, batch / lot and date received (C05)",
        "Delivery vehicle clean :: Vehicle and crates clean, covered and at the required temperature (C06)"
      ] },
      { name: "Storage", guidance: "Dry store, fridges and freezers: shelves, labelled containers and the thermometer display or probe reading.", parts: [
        "Dry store clean and organised :: Dry store clean, dry and ventilated, stock neatly arranged, no signs of pests (D01)",
        "Food stored off the floor :: All food on racks or pallets, off the floor and away from walls (D02)",
        "! Raw and cooked food segregated :: Raw food stored below and apart from cooked / ready-to-eat food, all covered (D03)",
        "! Fridge and freezer temperatures :: Thermometer shows chilled ≤5°C (≤4°C for animal-origin food) and frozen ≤−18°C (D04)",
        "Temperature logs maintained :: Fridge and freezer log filled every shift, deviations and actions recorded (D05)",
        "No expired stock :: Stock rotated first-expiry-first-out; no expired, spoiled or unlabelled food on shelves (D06)",
        "Containers covered and labelled :: Food containers covered and labelled with item name and prep / use-by date (D07)",
        "Non-food items kept out of food storage :: No chemicals or non-food items stored with food or packaging (D08)"
      ] },
      { name: "Preparation & cooking", guidance: "Prep and cooking areas during work: thawing, cutting boards, produce washing, and probe readings of cooked, hot-held and reheated food.", parts: [
        "Safe thawing :: Food thawing in the fridge (≤5°C) or another safe method, covered, no drips onto other food (E01)",
        "! Separate raw and ready-to-eat equipment :: Dedicated or colour-coded boards and knives for raw and ready-to-eat food (E02)",
        "Produce washed safely :: Vegetables and fruit washed in clean potable water in a dedicated sink or container (E03)",
        "! Cooking core temperature :: Probe in cooked food shows veg ≥65°C for 2 min, non-veg ≥70°C for 2 min or ≥75°C (E04)",
        "! Hot holding temperature :: Probe in hot-held food shows ≥65°C (≥70°C for non-veg); cold food ≤5°C (E05)",
        "! Cooling controlled :: Cooling log shows 60°C to 21°C within 2 h, then 21°C to 5°C within the next 2 h (E06)",
        "! Reheating to safe temperature :: Reheated food probe reads ≥75°C; not reheated in a bain-marie or under a heat lamp (E07)",
        "Batch and discard times labelled :: Prepared high-risk food labelled with time; nothing left out at room temperature (E08)",
        "Hygienic utensil use :: Clean separate spoons for tasting and serving; no bare-hand contact with ready food (E09)",
        "! No reuse of customer-exposed food :: Returned or leftover buffet food discarded as per policy, not reused (E10)"
      ] },
      { name: "Staff hygiene", guidance: "Food handlers at work: hand washing, uniforms and hair covers, hands and arms, and their training certificates.", parts: [
        "! Handwashing practised :: Food handlers washing hands with soap at the hand-wash sink before handling food (F01)",
        "Clean uniforms and hair covers :: Staff wear clean uniforms, hair nets or caps and aprons as required (F02)",
        "No jewellery or personal items :: No rings, watches, bangles or phones in food preparation areas (F03)",
        "! Cuts covered :: Cuts or wounds covered with a waterproof dressing or gloves; no visibly unwell food handlers (F04)",
        "No eating or smoking in the kitchen :: No eating, smoking, tobacco chewing or spitting in food areas; signage displayed (F05)",
        "Hygiene training records :: Records show staff trained in hygiene, cross-contamination and allergens (F06)",
        "FoSTaC supervisor certificate :: Valid FoSTaC Food Safety Supervisor certificate for the person on duty (F07)"
      ] },
      { name: "Cleaning & pests", guidance: "Cleaning schedule, sanitiser in use, cleaned surfaces, dish area, pest-control records, doors and screens, bins and drains.", parts: [
        "Cleaning schedule in place :: Schedule lists area, method, chemical, frequency and person responsible, with sign-offs (G01)",
        "Correct sanitiser in use :: Sanitiser labelled food-safe and prepared at the dilution stated on the label (G02)",
        "! Food-contact surfaces clean :: Worktops, boards and slicers visibly clean and sanitised, no food residue (G03)",
        "Dishwashing effective :: Dishwasher or 3-sink wash in use; washed utensils clean and air-drying on racks (G04)",
        "Pest control records :: Pest-control contract and recent service reports; no signs of active infestation (G05)",
        "Pest-proofing in place :: Doors close tightly, windows screened, drains covered, no gaps or holes (G06)",
        "Waste bins covered and clean :: Bins lidded (foot-operated), not overflowing and clean (G07)",
        "Drains and grease traps clean :: Drains and grease trap clean; no standing wastewater, odour or pests (G08)"
      ] },
      { name: "Allergens", guidance: "Allergen matrix, segregated allergen ingredients, separate utensils, special-diet order tickets and the menu.", parts: [
        "Allergen matrix available :: Recipe / allergen matrix lists allergens for each dish and matches supplier labels (H01)",
        "! Allergen ingredients segregated :: Allergen ingredients stored labelled and apart; separate utensils used (H02)",
        "Allergen information for staff :: Allergen information sheet available to staff at the service point (H03)",
        "! Special-diet orders controlled :: Allergen or special-diet orders clearly flagged on the ticket and prepared separately (H04)",
        "Menu declarations accurate :: Menu and labels show required declarations (veg / non-veg mark, allergens where applicable) (H05)"
      ] },
      { name: "Packaging & service", guidance: "Packaging store, packed-food labels, transport containers or vehicle, and the buffet counter with probe readings.", parts: [
        "Food-grade packaging :: Packaging marked food-grade and suitable for the food it holds (I01)",
        "Packaging stored protected :: Packaging stored covered, clean and dry, away from chemicals and pests (I02)",
        "Packed food labelled :: Labels show product name, date, batch and storage instructions (I03)",
        "Transport containers suitable :: Food carried in clean, closed, insulated containers or vehicles that hold temperature (I04)",
        "! Buffet protected and at temperature :: Sneeze guard fitted, separate serving utensils; hot food ≥65°C and cold ≤5°C (I05)",
        "! Dispatch record complete :: Dispatch log shows batch, time, temperature, vehicle and handover sign-off (I06)"
      ] },
      { name: "Incidents & actions", guidance: "Photograph the incident procedure, complaint register, recall / traceability record and corrective-action register pages.", parts: [
        "Incident procedure available :: Written procedure for food-poisoning or contamination incidents with escalation contacts (J01)",
        "Complaint register maintained :: Complaints logged with date, product, details, investigation and action taken (J02)",
        "! Recall and traceability procedure :: Recall / withdrawal procedure and a recent mock-recall or traceability test record (J03)",
        "Corrective action register :: Each finding has a root cause, action, owner, due date and status (J04)",
        "Closure verified :: Closed actions signed off by a responsible person with evidence (J05)",
        "Management review held :: Minutes or report show incidents, repeat findings and overdue actions reviewed (J06)"
      ] },
      { name: "Training & audits", guidance: "Photograph the training matrix, supervisor check sheets, reviewed logs, internal audit reports and lab test reports.", parts: [
        "Training plan in place :: Training matrix covers induction and refresher training for all food handlers (K01)",
        "Trained before working :: Induction records signed before staff start food-safety-critical tasks (K02)",
        "Supervisor shift checks :: Supervisor hygiene check sheets completed and signed every shift (K03)",
        "Logs reviewed :: Temperature and cleaning logs complete and signed as reviewed, deviations actioned (K04)",
        "Internal audits done :: Internal audit schedule and recent reports with repeat findings followed up (K05)",
        "Water and food test reports :: Lab reports for water / food tests as per the sampling plan; failures investigated (K06)"
      ] },
    ],
    general_parts: [],
  };

  const TYPES = [
    SCAFFOLD,
    FSSAI,
    {
      id: 'type-extinguisher', builtin: true, module: '', safety: true,
      name: 'Fire extinguisher', description: 'Monthly visual check of a portable fire extinguisher', idLabel: 'Extinguisher ID',
      angles: [
        { name: 'Front and label', guidance: 'Whole extinguisher from the front, label readable', parts: ['Instruction label :: label is present and readable', 'Body condition :: no dents, rust, leaks or damage on the cylinder'] },
        { name: 'Gauge and pin', guidance: 'Close-up of the top: pressure gauge, handle, pin and seal', parts: ['! Pressure gauge :: the needle is in the green zone', '! Safety pin and seal :: pin is in place and the tamper seal is unbroken'] },
        { name: 'Hose and nozzle', guidance: 'Close-up of the hose and nozzle', parts: ['Hose and nozzle :: attached, not cracked, cut or blocked'] },
        { name: 'Mounting and tag', guidance: 'The bracket or stand and the service tag', parts: ['! Mounting :: hung on a wall bracket or placed on a stand, not lying on the floor', 'Service tag :: a service / inspection tag is attached'] },
      ],
      general_parts: [],
    },
    {
      id: 'type-panel', builtin: true, module: '', safety: true,
      name: 'Electrical control panel', description: 'Wall-mounted LT control panel, door closed and open', idLabel: 'Panel ID',
      angles: [
        { name: 'Front (door closed)', guidance: 'Whole front face in frame, door closed', parts: ['Door lock :: door closes and has a handle or lock', 'Indicator lamps :: indicator lamps fitted, none missing or broken', '! Danger sticker :: danger / shock warning sticker displayed'] },
        { name: 'Inside (door open)', guidance: 'Open the door, capture all components', parts: ['MCBs / breakers :: breakers fitted, no empty or broken slots', '! Earthing wire :: earthing wire connected and tightened at the earth terminal', '! Wiring :: no loose, burnt or bare wires visible', 'Wire labels :: wires have ferrules or labels'] },
      ],
      general_parts: ['Nameplate :: nameplate or serial label present'],
    },
    {
      id: 'type-laptop', builtin: true, module: '', safety: false,
      name: 'Laptop setup', description: 'Laptop on desk with charger and USB device connected', idLabel: 'Asset tag',
      angles: [
        { name: 'Left side ports', guidance: 'Close-up of the left edge, ports and plugs clearly visible', parts: ['USB cable :: a USB cable plug is fully inserted into a USB port on the laptop', 'Charger cable :: the charger plug is inserted into the laptop charging port'] },
        { name: 'Screen on', guidance: 'Lid open, whole screen visible', parts: ['Screen on :: screen is switched on and showing an image', 'Screen damage :: no cracks, lines or dead areas on the screen'] },
      ],
      general_parts: ['Asset label :: asset or service tag label visible'],
    },
  ];

  // ---------- scripted AI findings for scaffold ----------
  // status: present (OK) / missing (Not OK) / unclear. box = [x, y, w, h] as fractions of the photo.
  const S = (status, confidence, evidence, box, on) => ({ status, confidence, evidence, box, on });
  const SCAFFOLD_SCRIPT = {
    pass: {
      images: { 'Base & foundation': 'p-base', 'Full elevation': 'p-elev', 'Working platform': 'p-plat', 'Access ladder': 'p-ladder', 'Scaffold tag': 'p-tag', 'Joints & members (close-up)': 'p-elev' },
      checks: {
        'Base plates': S('present', 0.97, 'Steel base plates seated under all 6 visible standards', [0.06, 0.66, 0.34, 0.26]),
        'Base jacks': S('present', 0.93, 'Base jacks set with short extension; threads clean, no rust', null),
        'Sole boards / firm ground': S('present', 0.94, 'Timber sole boards run under the base plates on level, compacted ground', [0.42, 0.72, 0.44, 0.2]),
        'Standards plumb': S('present', 0.92, 'Uprights are vertical along the run; no lean or settlement seen', [0.18, 0.08, 0.2, 0.62]),
        'Ledgers and transoms': S('present', 0.96, 'Ledgers present at every lift – 4 lifts counted, none missing', [0.1, 0.2, 0.78, 0.5]),
        'Bracing': S('present', 0.93, 'Diagonal façade bracing runs across alternate bays, bottom to top', [0.52, 0.16, 0.3, 0.6]),
        'Ties to structure': S('present', 0.9, 'Tie tubes visible at lifts 2 and 4, fixed into the façade', [0.08, 0.3, 0.22, 0.3]),
        'Platform fully boarded': S('present', 0.95, 'Platform close-boarded across the full width; no gaps or loose boards', [0.12, 0.52, 0.7, 0.18]),
        'Top rail': S('present', 0.97, 'Top rail fitted along the open edge at about 1 m', [0.08, 0.3, 0.84, 0.1]),
        'Mid rail': S('present', 0.93, 'Mid rail fitted between the top rail and toe board on the open side', [0.08, 0.42, 0.84, 0.08]),
        'Toe boards': S('present', 0.91, 'Toe boards fitted along the outer edge of the platform', [0.08, 0.5, 0.84, 0.07]),
        'Platform clear': S('present', 0.89, 'Only light hand tools on the deck; walkway clear', [0.3, 0.55, 0.4, 0.2]),
        'Access ladder': S('present', 0.92, 'Ladder tied at the top, extends about 1 m above the landing', [0.38, 0.12, 0.22, 0.76]),
        'Scaffold tag': S('present', 0.98, 'Green "SAFE TO USE" tag displayed at the access point, dated this week', [0.3, 0.14, 0.42, 0.72]),
        'Couplers / clamps': S('present', 0.91, 'Right-angle couplers fitted at node points; none loose or missing', [0.5, 0.4, 0.18, 0.16]),
        'Tube condition': S('present', 0.88, 'Tubes straight; light surface rust only, no bends or cracks', [0.2, 0.2, 0.6, 0.6]),
      },
      generalFoundIn: { 'Couplers / clamps': 'Full elevation', 'Tube condition': 'Working platform' },
      defects: [],
      summary: 'Scaffold is complete and fit for use: firm base, fully braced and tied, close-boarded platform with full edge protection, secured ladder and a current tag.',
      recommendations: ['Re-inspect within 7 days or after bad weather, alteration or impact.', 'Keep the platform clear of stacked material.'],
    },
    fail: {
      images: { 'Base & foundation': 'f-base', 'Full elevation': 'f-elev', 'Working platform': 'f-plat', 'Access ladder': 'f-ladder', 'Scaffold tag': 'f-tag', 'Joints & members (close-up)': 'f-elev' },
      checks: {
        'Base plates': S('present', 0.86, 'Base plates visible under the front standards', [0.08, 0.68, 0.3, 0.24]),
        'Base jacks': S('present', 0.8, 'Base jacks visible under the front standards; no damage seen', null),
        'Sole boards / firm ground': S('missing', 0.93, 'Two base plates rest on loose bricks and packing instead of sole boards', [0.4, 0.66, 0.36, 0.26]),
        'Standards plumb': S('missing', 0.84, 'Corner standard leans outward and the run is distorted near the base', [0.62, 0.1, 0.24, 0.6]),
        'Ledgers and transoms': S('present', 0.88, 'Ledgers present at each lift on the visible bays', [0.1, 0.22, 0.76, 0.46]),
        'Bracing': S('unclear', 0.52, 'Façade bracing not visible on the right-hand bays – netting blocks the view', [0.56, 0.2, 0.34, 0.5]),
        'Ties to structure': S('missing', 0.87, 'No ties seen on the top two lifts where the wall side is visible', [0.06, 0.06, 0.3, 0.3]),
        'Platform fully boarded': S('missing', 0.91, 'Gap of about two boards near the ladder access; one board overhangs unsupported', [0.36, 0.5, 0.3, 0.16]),
        'Top rail': S('present', 0.85, 'Top rail fitted on the long side', [0.06, 0.28, 0.6, 0.1]),
        'Mid rail': S('missing', 0.9, 'No mid rail on the north open side of the platform', [0.6, 0.36, 0.34, 0.12]),
        'Toe boards': S('missing', 0.92, 'Toe board missing along the outer edge of the platform', [0.1, 0.5, 0.8, 0.08]),
        'Platform clear': S('missing', 0.88, 'Stacked materials and loose debris on the deck – trip hazard', [0.22, 0.56, 0.34, 0.2]),
        'Access ladder': S('unclear', 0.58, 'Ladder top and its extension above the landing are not in view', [0.4, 0.06, 0.2, 0.5]),
        'Scaffold tag': S('missing', 0.95, 'Red tag shows last inspection 21 days ago – tag has expired', [0.3, 0.14, 0.42, 0.72]),
        'Couplers / clamps': S('missing', 0.86, 'Loose coupler hanging off a ledger at the 2nd lift', [0.44, 0.36, 0.16, 0.16]),
        'Tube condition': S('present', 0.8, 'Visible tubes straight; surface rust only', [0.2, 0.2, 0.6, 0.6]),
      },
      generalFoundIn: { 'Couplers / clamps': 'Full elevation', 'Tube condition': 'Full elevation' },
      defects: [
        { angle: 'Base & foundation', description: 'Base plates resting on loose bricks instead of timber sole boards', severity: 'high' },
        { angle: 'Working platform', description: 'Open platform edge without toe board and mid rail – fall and dropped-object risk', severity: 'high' },
        { angle: 'Full elevation', description: 'Loose coupler hanging at the 2nd lift, north-west corner', severity: 'medium' },
        { angle: 'Working platform', description: 'Material stacked on the deck near the ladder landing', severity: 'medium' },
      ],
      summary: 'Scaffold is NOT safe to use. Foundation, edge protection, platform boarding and ties are deficient and the tag has expired.',
      recommendations: [
        'Remove the scaffold from use: replace the tag with a red "DO NOT USE" tag at every access point.',
        'Replace bricks and packing with timber sole boards under every base plate; re-level and plumb the corner standard.',
        'Fit mid rail and toe boards on all open sides; close-board the platform near the ladder access.',
        'Tighten or replace the loose coupler at lift 2; add ties at the top two lifts as per the tie pattern.',
        'Clear stacked material from the deck; re-inspect and re-tag before anyone uses the scaffold.',
      ],
    },
  };

  // findings written from the client's real site photos (inspected 21 Oct 2026)
  SCAFFOLD_SCRIPT.site = {
    images: { 'Base & foundation': 's-base', 'Full elevation': 's-elev', 'Working platform': 's-plat', 'Access ladder': 's-ladder', 'Scaffold tag': 's-ladder', 'Joints & members (close-up)': 's-base' },
    shotTimes: { 'Base & foundation': '11:08:48', 'Access ladder': '11:08:56', 'Scaffold tag': '11:08:56', 'Working platform': '11:09:02', 'Full elevation': '11:09:09' },
    checks: {
      'Base plates': S('present', 0.9, 'Base plate seated flat on the concrete floor', [0.36, 0.5, 0.24, 0.11]),
      'Base jacks': S('missing', 0.88, 'Adjustable base jack is heavily rusted on the stem and thread', [0.4, 0.36, 0.12, 0.15]),
      'Sole boards / firm ground': S('present', 0.84, 'Base plate sits on a solid, level concrete floor – firm footing (sole board not needed on concrete)', [0.08, 0.64, 0.84, 0.3]),
      'Standards plumb': S('present', 0.8, 'Standard above the base jack stands vertical; no settlement on the floor', [0.33, 0.0, 0.15, 0.2]),
      'Ledgers and transoms': S('present', 0.83, 'Horizontal ledgers present at each lift along the visible bays', [0.2, 0.3, 0.55, 0.42]),
      'Bracing': S('present', 0.87, 'Diagonal face braces plus a long raking brace from the ground to mid-height', [0.1, 0.33, 0.5, 0.52]),
      'Ties to structure': S('unclear', 0.48, 'No ties to the wall visible in this view – confirm on site', [0.05, 0.12, 0.25, 0.45]),
      'Platform fully boarded': S('present', 0.8, 'Slatted steel planks cover the full platform width; no missing planks seen from below', [0.05, 0.15, 0.75, 0.42]),
      'Top rail': S('present', 0.82, 'Top rail fitted along the open side of the platform', [0.28, 0.0, 0.6, 0.12]),
      'Mid rail': S('present', 0.78, 'Mid rail fitted between the top rail and the platform', null),
      'Toe boards': S('missing', 0.86, 'No toe board along the open edge of the platform – guardrail is incomplete',
        { poly: [[0.686, 0.386], [0.653, 0.444], [0.339, 0.361], [0.097, 0.246], [0.163, 0.13], [0.684, 0.359]] }, 'Access ladder'),
      'Platform clear': S('present', 0.68, 'No stacked material seen on the platform through the open planks', [0.1, 0.17, 0.4, 0.24]),
      'Access ladder': S('missing', 0.86, 'Ladder rests against the scaffold with no visible tie, almost no extension above the platform level, and no landing platform at the top of the ladder', [0.33, 0.21, 0.64, 0.31]),
      'Scaffold tag': S('missing', 0.82, 'No inspection tag or status board visible at the ladder access point', [0.45, 0.62, 0.3, 0.36]),
      'Couplers / clamps': S('present', 0.8, 'Couplers fitted at the base node; none hanging loose', [0.28, 0.19, 0.26, 0.17]),
      'Tube condition': S('present', 0.78, 'Tubes straight; no bent or cracked tubes seen', null),
    },
    generalFoundIn: { 'Couplers / clamps': 'Base & foundation', 'Tube condition': 'Full elevation' },
    defects: [
      { angle: 'Access ladder', description: 'No landing platform at the top of the ladder; ladder not tied and with almost no extension above the platform level', severity: 'high' },
      { angle: 'Working platform', description: 'Toe board missing along the open platform edge – guardrail incomplete, dropped-object risk', severity: 'medium' },
      { angle: 'Base & foundation', description: 'Adjustable base jack heavily rusted on the stem and thread', severity: 'medium' },
      { angle: 'Full elevation', description: 'Loose blocks lying beside the drain channel near the standards', severity: 'low' },
    ],
    summary: 'Scaffold is NOT ready for use. The base sits on a firm concrete floor, the structure is well braced and the top rail and mid rail are in place, but there is no landing platform at the top of the ladder, the ladder is not secured, the toe board is missing on the open platform edge and the adjustable base jack is heavily rusted. Ties to the wall could not be confirmed from these photos and no inspection tag was seen. The base area is correctly barricaded.',
    recommendations: [
      'Keep the area barricaded and fix a red "DO NOT USE" tag at the access point until the points below are closed.',
      'Provide a proper landing platform at the top of the ladder; tie the ladder and extend it about 1 m above the landing.',
      'Fit toe boards along every open edge of the working platform to complete the guardrail.',
      'Replace the rusted adjustable base jack (or clean and inspect the thread and stem, and replace if corroded).',
      'Confirm ties to the building at the required spacing and make sure loose blocks near the drain channel are not used as packing.',
      'Re-inspect with photos taken from platform level and of the tag, then re-tag before use.',
    ],
  };

  // ---------- live scan hints (shown while the demo camera pans) ----------
  const LIVE_HINTS = {
    'Base & foundation': ['Tilt down to the base plates', 'Hold steady', 'Pan along the bottom'],
    'Full elevation': ['Step back to fit the whole face', 'Hold steady', 'Pan up to the top lift'],
    'Working platform': ['Move to platform level', 'Show the open edge', 'Hold steady'],
    'Access ladder': ['Show the ladder top', 'Hold steady'],
    'Scaffold tag': ['Move closer to the tag', 'Hold steady'],
  };

  // ---------- seeded QR tags (assets) ----------
  const ASSETS = [
    { id: 'SC-014', typeId: 'type-scaffold', scaffoldType: 'tube', site: 'Orchid Heights, Pune', location: 'Tower A – east elevation', height: '12', length: '18', lifts: '6', duty: 'Medium', swl: '600', erector: 'Shree Scaffolding Co.', scenario: 'pass', createdDaysAgo: 20 },
    { id: 'SC-027', typeId: 'type-scaffold', scaffoldType: 'tube', site: 'Orchid Heights, Pune', location: 'Tower B – north face', height: '18', length: '24', lifts: '9', duty: 'Heavy', swl: '900', erector: 'Apex Access Pvt Ltd', scenario: 'fail', createdDaysAgo: 34 },
    { id: 'SC-031', typeId: 'type-scaffold', scaffoldType: 'tube', site: 'Orchid Heights, Pune', location: 'Podium – ramp area', height: '6', length: '6', lifts: '3', duty: 'Light', swl: '300', erector: 'Shree Scaffolding Co.', scenario: 'pass', createdDaysAgo: 6 },
    { id: 'SC-040', typeId: 'type-scaffold', scaffoldType: 'tube', site: 'Orchid Heights, Pune', location: 'Service yard – drain side wall', height: '8', length: '10', lifts: '4', duty: 'Medium', swl: '450', erector: 'Site contractor', scenario: 'site', createdDaysAgo: 3 },
    { id: 'FE-108', typeId: 'type-extinguisher', site: 'Orchid Heights, Pune', location: 'Site office – entrance', scenario: 'pass', createdDaysAgo: 60 },
  ];

  // seeded reports: built by the app from the scripts above (asset id, scenario, days ago, inspector)
  const SEED_REPORTS = [
    { assetId: 'SC-014', scenario: 'pass', daysAgo: 1, hour: 9, mode: 'live', signed: true, remarks: 'Fit for use. Re-inspect next Monday.' },
    { assetId: 'SC-027', scenario: 'fail', daysAgo: 2, hour: 15, mode: 'photo', signed: true, remarks: 'Red tagged. Scaffold contractor informed to rectify base and edge protection.' },
  ];

  // ---------- simulated "Suggest with AI" for the type editor ----------
  const SUGGEST_LIBRARY = [
    { k: /fork ?lift/i, angles: [
      { name: 'Front and forks', guidance: 'Whole front with forks and mast in frame', parts: ['! Forks :: no cracks, bends or uneven wear on the fork arms', 'Mast chains :: chains present, not slack or rusted', 'Load backrest :: fitted and not bent'] },
      { name: 'Operator cab', guidance: 'Seat, controls and overhead guard', parts: ['! Seat belt :: seat belt fitted and not damaged', 'Overhead guard :: fitted, no cracks or bends', 'Horn and lights :: lamps fitted, none broken'] },
      { name: 'Wheels and tyres', guidance: 'Close-up of each wheel', parts: ['! Tyres :: no deep cuts, chunks missing or bald areas', 'Wheel nuts :: all wheel nuts present'] },
      { name: 'Engine / battery bay', guidance: 'Open the cover, capture the bay', parts: ['Leaks :: no oil, fuel or battery acid leaks visible', 'Battery cables :: connected, no exposed copper'] },
    ], general: ['Capacity plate :: rated capacity plate present and readable'] },
    { k: /ladder/i, angles: [
      { name: 'Full ladder', guidance: 'Whole ladder from the side', parts: ['! Stiles :: no bends, cracks or splits', '! Rungs :: all rungs present and firm', 'Feet :: anti-slip feet fitted on both stiles'] },
      { name: 'Top and locks', guidance: 'Close-up of the top and any locking bars', parts: ['Locking bars :: locks / spreaders engaged', 'Top cap :: fitted, not broken'] },
    ], general: ['Label :: duty rating label readable'] },
    { k: /harness|fall arrest/i, angles: [
      { name: 'Front straps', guidance: 'Harness laid flat, front side up', parts: ['! Webbing :: no cuts, burns, fraying or chemical damage', 'Buckles :: buckles present, not deformed'] },
      { name: 'D-ring and lanyard', guidance: 'Close-up of the back D-ring and lanyard', parts: ['! D-ring :: not bent, cracked or corroded', '! Lanyard hook :: gate closes and locks', 'Shock absorber :: pack intact, not deployed'] },
    ], general: ['Label :: manufacture / inspection label readable'] },
    { k: /generator|dg set|genset/i, angles: [
      { name: 'Control panel', guidance: 'Panel with meters and switches in view', parts: ['Meters :: meters fitted and readable', '! Emergency stop :: red stop button present, not damaged'] },
      { name: 'Engine side', guidance: 'Open the canopy door', parts: ['Leaks :: no oil or fuel leaks', 'Belts :: fan belt present, not cracked'] },
      { name: 'Earthing', guidance: 'Earth pit and earth connection', parts: ['! Earthing :: earth cable connected to the body and earth pit'] },
    ], general: ['Fire extinguisher :: extinguisher kept near the set'] },
    { k: /crane|hoist/i, angles: [
      { name: 'Hook block', guidance: 'Close-up of the hook and latch', parts: ['! Safety latch :: latch fitted and closes the hook', 'Hook :: no cracks or opening of the throat'] },
      { name: 'Wire rope', guidance: 'Rope on the drum and the falls', parts: ['! Wire rope :: no broken wires, kinks or birdcaging'] },
      { name: 'Load chart', guidance: 'Load chart in the cab', parts: ['Load chart :: load chart displayed and readable'] },
    ], general: ['SWL marking :: safe working load marked'] },
  ];

  window.DEMO = { SCAFFOLD_TYPES, SCAFFOLD_GUIDANCE, LOCAL, COMMONS, GENERATED, TYPES, SCAFFOLD_SCRIPT, LIVE_HINTS, ASSETS, SEED_REPORTS, SUGGEST_LIBRARY };
})();
