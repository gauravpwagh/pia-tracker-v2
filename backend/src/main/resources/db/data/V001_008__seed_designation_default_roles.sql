-- V001_008__seed_designation_default_roles.sql
-- Maps designations to their default roles.
-- These rows are read by the user-provisioning service when a new user is
-- created: the service copies every matching row into user_roles for the
-- new user's designation.
--
-- ROLE_NODAL_DY_CE_C is deliberately absent — it is granted per-project on
-- Nodal Dy CE/C assignment via the workflow, never by designation default.
--
-- ROLE_BOARD_VIEWER is deliberately absent — it is granted via user_permissions
-- (system grant) for Railway Board / HQ personnel, not by designation.

INSERT INTO designation_default_roles (designation_code, role_code) VALUES

-- Core construction hierarchy
('EDGS_CI',       'ROLE_EDGS_CI'),
('CAO_C',         'ROLE_CAO_C'),
('CE_C',          'ROLE_CE_C'),
('DY_CE_C',       'ROLE_DY_CE_C'),

-- Administration
('ADMIN',         'ROLE_ADMIN'),
('SUPER_ADMIN',   'ROLE_SUPER_ADMIN'),

-- -------------------------------------------------------------------------
-- Approval designations
-- All discipline officers who may appear in drawing approver checklists
-- receive ROLE_APPROVER_GENERIC as their designation default.
-- -------------------------------------------------------------------------
('CE_PLANNING',     'ROLE_APPROVER_GENERIC'),
('DY_CE_PLANNING',  'ROLE_APPROVER_GENERIC'),
('DY_CE_DESIGN',    'ROLE_APPROVER_GENERIC'),
('DY_CE',           'ROLE_APPROVER_GENERIC'),
('SR_DEN',          'ROLE_APPROVER_GENERIC'),
('SR_DEN_CO',       'ROLE_APPROVER_GENERIC'),
('CBE',             'ROLE_APPROVER_GENERIC'),
('DY_CE_BRIDGE',    'ROLE_APPROVER_GENERIC'),
('CTE',             'ROLE_APPROVER_GENERIC'),
('DY_CE_TRACK',     'ROLE_APPROVER_GENERIC'),
('CPDE',            'ROLE_APPROVER_GENERIC'),
('PCE',             'ROLE_APPROVER_GENERIC'),
('DY_CSTE',         'ROLE_APPROVER_GENERIC'),
('SR_DSTE',         'ROLE_APPROVER_GENERIC'),
('CSTE_CON',        'ROLE_APPROVER_GENERIC'),
('CSTE_OL',         'ROLE_APPROVER_GENERIC'),
('PSCTE',           'ROLE_APPROVER_GENERIC'),
('DY_CEE',          'ROLE_APPROVER_GENERIC'),
('SR_DEE_TRD',      'ROLE_APPROVER_GENERIC'),
('CEE_CON',         'ROLE_APPROVER_GENERIC'),
('PCEE',            'ROLE_APPROVER_GENERIC'),
('SR_DOM',          'ROLE_APPROVER_GENERIC'),
('PCOM',            'ROLE_APPROVER_GENERIC'),
('SR_DCM',          'ROLE_APPROVER_GENERIC'),
('ADRM',            'ROLE_APPROVER_GENERIC'),
('DRM',             'ROLE_APPROVER_GENERIC'),
('CTPM',            'ROLE_APPROVER_GENERIC'),
('PCSO',            'ROLE_APPROVER_GENERIC'),
('CRS',             'ROLE_APPROVER_GENERIC'),
('GM',              'ROLE_APPROVER_GENERIC');
