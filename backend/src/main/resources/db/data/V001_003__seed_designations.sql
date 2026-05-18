-- PIA Tracker — V001_003 Reference seed: designation registry (~36 designations)
-- Every row satisfies: chk_designations_at_least_one_role (is_approval_role OR is_data_entry_role)

INSERT INTO designations (code, name, short_label, category, is_approval_role, is_data_entry_role, display_order, description) VALUES

-- Construction / data-entry roles
('EDGS_CI',       'Executive Director General, Strategy / Construction-Infrastructure', 'EDGS/C-I',    'ADMIN',        false, true,  10,  'Executive Director General overseeing strategy and construction infrastructure'),
('CAO_C',         'Chief Administrative Officer (Construction)',                        'CAO/C',        'CONSTRUCTION', false, true,  20,  'Chief Administrative Officer for construction wing'),
('CE_C',          'Chief Engineer (Construction)',                                      'CE/C',         'CONSTRUCTION', false, true,  30,  'Chief Engineer responsible for construction activities'),
('CE_PLANNING',   'Chief Engineer (Planning)',                                          'CE/Planning',  'PLANNING',     true,  true,  40,  'Chief Engineer responsible for planning and approvals'),
('DY_CE_C',       'Deputy Chief Engineer (Construction)',                               'Dy CE/C',      'CONSTRUCTION', false, true,  50,  'Deputy Chief Engineer for construction'),
('DY_CE_PLANNING','Deputy Chief Engineer (Planning)',                                   'Dy CE/Planning','PLANNING',    true,  false, 60,  'Deputy Chief Engineer for planning'),
('DY_CE_DESIGN',  'Deputy Chief Engineer (Design)',                                     'Dy CE/Design', 'PLANNING',     true,  false, 70,  'Deputy Chief Engineer for design'),

-- Drawing approval — Engineering
('DY_CE',         'Deputy Chief Engineer',                                              'Dy CE',        'CONSTRUCTION', true,  false, 110, 'Deputy Chief Engineer (general)'),
('SR_DEN',        'Senior Divisional Engineer',                                         'Sr DEN',       'CONSTRUCTION', true,  false, 120, 'Senior Divisional Engineer'),
('SR_DEN_CO',     'Senior Divisional Engineer (Coordination)',                          'Sr DEN/Co',    'CONSTRUCTION', true,  false, 130, 'Senior Divisional Engineer — Coordination'),
('CBE',           'Chief Bridge Engineer',                                              'CBE',          'BRIDGE',       true,  false, 140, 'Chief Bridge Engineer'),
('DY_CE_BRIDGE',  'Deputy Chief Engineer (Bridge)',                                     'Dy CE/Bridge', 'BRIDGE',       true,  false, 150, 'Deputy Chief Engineer for bridges'),
('CTE',           'Chief Track Engineer',                                               'CTE',          'TRACK',        true,  false, 160, 'Chief Track Engineer'),
('DY_CE_TRACK',   'Deputy Chief Engineer (Track)',                                      'Dy CE/Track',  'TRACK',        true,  false, 170, 'Deputy Chief Engineer for track'),
('CPDE',          'Chief Planning and Design Engineer',                                 'CPDE',         'PLANNING',     true,  false, 180, 'Chief Planning and Design Engineer'),
('PCE',           'Principal Chief Engineer',                                           'PCE',          'CONSTRUCTION', true,  false, 190, 'Principal Chief Engineer'),

-- Drawing approval — S&T
('DY_CSTE',       'Deputy Chief Signal & Telecom Engineer',                             'Dy CSTE',      'ST',           true,  false, 210, 'Deputy Chief Signal & Telecom Engineer'),
('SR_DSTE',       'Senior Divisional Signal & Telecom Engineer',                        'Sr DSTE',      'ST',           true,  false, 220, 'Senior Divisional Signal & Telecom Engineer'),
('CSTE_CON',      'Chief Signal & Telecom Engineer (Construction)',                     'CSTE/Con',     'ST',           true,  false, 230, 'Chief Signal & Telecom Engineer — Construction'),
('CSTE_OL',       'Chief Signal & Telecom Engineer (Open Line)',                        'CSTE/OL',      'ST',           true,  false, 240, 'Chief Signal & Telecom Engineer — Open Line'),
('PSCTE',         'Principal Chief Signal & Telecom Engineer',                          'PSCTE',        'ST',           true,  false, 250, 'Principal Chief Signal & Telecom Engineer'),

-- Drawing approval — Electrical
('DY_CEE',        'Deputy Chief Electrical Engineer',                                   'Dy CEE',       'ELECTRICAL',   true,  false, 310, 'Deputy Chief Electrical Engineer'),
('SR_DEE_TRD',    'Senior Divisional Electrical Engineer (Traction)',                   'Sr DEE/TRD',   'ELECTRICAL',   true,  false, 320, 'Senior Divisional Electrical Engineer — Traction'),
('CEE_CON',       'Chief Electrical Engineer (Construction)',                           'CEE/Con',      'ELECTRICAL',   true,  false, 330, 'Chief Electrical Engineer — Construction'),
('PCEE',          'Principal Chief Electrical Engineer',                                'PCEE',         'ELECTRICAL',   true,  false, 340, 'Principal Chief Electrical Engineer'),

-- Drawing approval — Operations / Safety
('SR_DOM',        'Senior Divisional Operations Manager',                               'Sr DOM',       'OPERATIONS',   true,  false, 410, 'Senior Divisional Operations Manager'),
('PCOM',          'Principal Chief Operations Manager',                                 'PCOM',         'OPERATIONS',   true,  false, 420, 'Principal Chief Operations Manager'),
('SR_DCM',        'Senior Divisional Commercial Manager',                               'Sr DCM',       'COMMERCIAL',   true,  false, 430, 'Senior Divisional Commercial Manager'),
('ADRM',          'Additional Divisional Railway Manager',                              'ADRM',         'OPERATIONS',   true,  false, 440, 'Additional Divisional Railway Manager'),
('DRM',           'Divisional Railway Manager',                                         'DRM',          'OPERATIONS',   true,  false, 450, 'Divisional Railway Manager'),
('CTPM',          'Chief Track Project Manager',                                        'CTPM',         'TRACK',        true,  false, 460, 'Chief Track Project Manager'),
('PCSO',          'Principal Chief Safety Officer',                                     'PCSO',         'SAFETY',       true,  false, 470, 'Principal Chief Safety Officer'),
('CRS',           'Commissioner of Railway Safety',                                     'CRS',          'SAFETY',       true,  false, 480, 'Commissioner of Railway Safety'),
('GM',            'General Manager',                                                    'GM',           'ADMIN',        true,  false, 490, 'General Manager'),

-- System roles
('ADMIN',         'System Administrator',                                               'Admin',        'SYSTEM',       false, true,  900, 'System administrator with full application access'),
('SUPER_ADMIN',   'Super Administrator',                                                'SAdmin',       'SYSTEM',       false, true,  910, 'Super administrator — unrestricted access');
