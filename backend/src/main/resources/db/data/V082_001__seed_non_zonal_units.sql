-- PIA Tracker — V022_001 Additional zones: non-zonal railway units
-- These are production units, PSUs, metro railways, and construction orgs
-- that appear in the HRMS data. Added as zones so their officers can be
-- assigned to projects that span these entities.

INSERT INTO zones (code, name, short_name, display_order) VALUES
    ('METRO',   'Kolkata Metro Railway',                    'Metro',    18),
    ('RWF',     'Rail Wheel Factory, Bangalore',            'RWF',      19),
    ('RWP',     'Rail Wheel Plant, Bela',                   'RWP',      20),
    ('ICF',     'Integral Coach Factory, Chennai',          'ICF',      21),
    ('MCF',     'Modern Coach Factory, Raebareli',          'MCF',      22),
    ('RCF',     'Rail Coach Factory, Kapurthala',           'RCF',      23),
    ('CLW',     'Chittaranjan Locomotive Works',            'CLW',      24),
    ('DLW',     'Diesel Locomotive Works, Varanasi',        'DLW',      25),
    ('DMW',     'Diesel Modernisation Works, Patiala',      'DMW',      26),
    ('NFRC',    'Northeast Frontier Railway Construction',  'NFR/C',    27),
    ('CORE',    'Central Organisation for Railway Electrification', 'CORE', 28),
    ('RVNL',    'Rail Vikas Nigam Limited',                 'RVNL',     29),
    ('RAILTEL', 'RailTel Corporation of India',             'RailTel',  30),
    ('IRCON',   'IRCON International Limited',              'IRCON',    31),
    ('RDSO',    'Research Designs and Standards Organisation', 'RDSO',  32),
    ('BLW', 'BANARAS LOCOMOTIVE WORKS', 'BLW', 101)
ON CONFLICT (code) DO NOTHING;
