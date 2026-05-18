-- PIA Tracker — V001_002 Reference seed: key operational divisions

-- CR — Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'CSTM', 'Mumbai CST', 1 FROM zones z WHERE z.code = 'CR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BSL', 'Bhusawal', 2 FROM zones z WHERE z.code = 'CR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'PUNE', 'Pune', 3 FROM zones z WHERE z.code = 'CR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'NGP', 'Nagpur', 4 FROM zones z WHERE z.code = 'CR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SUR', 'Solapur', 5 FROM zones z WHERE z.code = 'CR';

-- ECR — East Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'DNR', 'Danapur', 1 FROM zones z WHERE z.code = 'ECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'DHN', 'Dhanbad', 2 FROM zones z WHERE z.code = 'ECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MGS', 'Mughalsarai', 3 FROM zones z WHERE z.code = 'ECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SPJ', 'Samastipur', 4 FROM zones z WHERE z.code = 'ECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SEE', 'Sonpur', 5 FROM zones z WHERE z.code = 'ECR';

-- ECOR — East Coast Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'KUR', 'Khurda Road', 1 FROM zones z WHERE z.code = 'ECOR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SBP', 'Sambalpur', 2 FROM zones z WHERE z.code = 'ECOR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'VSKP', 'Visakhapatnam', 3 FROM zones z WHERE z.code = 'ECOR';

-- ER — Eastern Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'HWH', 'Howrah', 1 FROM zones z WHERE z.code = 'ER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SDAH', 'Sealdah', 2 FROM zones z WHERE z.code = 'ER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'ASN', 'Asansol', 3 FROM zones z WHERE z.code = 'ER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MLD', 'Malda', 4 FROM zones z WHERE z.code = 'ER';

-- KR — Konkan Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'KR', 'Konkan', 1 FROM zones z WHERE z.code = 'KR';

-- NCR — North Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'PRYJ', 'Prayagraj', 1 FROM zones z WHERE z.code = 'NCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'AGC', 'Agra', 2 FROM zones z WHERE z.code = 'NCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'JHS', 'Jhansi', 3 FROM zones z WHERE z.code = 'NCR';

-- NER — North Eastern Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'IZN', 'Izatnagar', 1 FROM zones z WHERE z.code = 'NER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'LKO', 'Lucknow', 2 FROM zones z WHERE z.code = 'NER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BSB', 'Varanasi', 3 FROM zones z WHERE z.code = 'NER';

-- NFR — Northeast Frontier Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'APDJ', 'Alipurduar', 1 FROM zones z WHERE z.code = 'NFR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'KIR', 'Katihar', 2 FROM zones z WHERE z.code = 'NFR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'LMG', 'Lumding', 3 FROM zones z WHERE z.code = 'NFR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'RNY', 'Rangiya', 4 FROM zones z WHERE z.code = 'NFR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'TSK', 'Tinsukia', 5 FROM zones z WHERE z.code = 'NFR';

-- NR — Northern Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'DLI', 'Delhi', 1 FROM zones z WHERE z.code = 'NR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'UMB', 'Ambala', 2 FROM zones z WHERE z.code = 'NR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MB', 'Moradabad', 3 FROM zones z WHERE z.code = 'NR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'LKO', 'Lucknow', 4 FROM zones z WHERE z.code = 'NR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'FZR', 'Firozpur', 5 FROM zones z WHERE z.code = 'NR';

-- NWR — North Western Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'JP', 'Jaipur', 1 FROM zones z WHERE z.code = 'NWR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'AII', 'Ajmer', 2 FROM zones z WHERE z.code = 'NWR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BKN', 'Bikaner', 3 FROM zones z WHERE z.code = 'NWR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'JU', 'Jodhpur', 4 FROM zones z WHERE z.code = 'NWR';

-- SCR — South Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SC', 'Secunderabad', 1 FROM zones z WHERE z.code = 'SCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'HYB', 'Hyderabad', 2 FROM zones z WHERE z.code = 'SCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'GNT', 'Guntur', 3 FROM zones z WHERE z.code = 'SCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'NED', 'Nanded', 4 FROM zones z WHERE z.code = 'SCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'GTL', 'Guntakal', 5 FROM zones z WHERE z.code = 'SCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BZA', 'Vijayawada', 6 FROM zones z WHERE z.code = 'SCR';

-- SECR — South East Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BSP', 'Bilaspur', 1 FROM zones z WHERE z.code = 'SECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'R', 'Raipur', 2 FROM zones z WHERE z.code = 'SECR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'NAG', 'Nagpur', 3 FROM zones z WHERE z.code = 'SECR';

-- SER — South Eastern Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'ADRA', 'Adra', 1 FROM zones z WHERE z.code = 'SER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'CKP', 'Chakradharpur', 2 FROM zones z WHERE z.code = 'SER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'KGP', 'Kharagpur', 3 FROM zones z WHERE z.code = 'SER';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'RNC', 'Ranchi', 4 FROM zones z WHERE z.code = 'SER';

-- SR — Southern Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MAS', 'Chennai', 1 FROM zones z WHERE z.code = 'SR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MDU', 'Madurai', 2 FROM zones z WHERE z.code = 'SR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'TPJ', 'Tiruchirappalli', 3 FROM zones z WHERE z.code = 'SR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SA', 'Salem', 4 FROM zones z WHERE z.code = 'SR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'PGT', 'Palakkad', 5 FROM zones z WHERE z.code = 'SR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'TVC', 'Thiruvananthapuram', 6 FROM zones z WHERE z.code = 'SR';

-- SWR — South Western Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'UBL', 'Hubballi', 1 FROM zones z WHERE z.code = 'SWR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'SBC', 'Bengaluru', 2 FROM zones z WHERE z.code = 'SWR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MYS', 'Mysuru', 3 FROM zones z WHERE z.code = 'SWR';

-- WCR — West Central Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'JBP', 'Jabalpur', 1 FROM zones z WHERE z.code = 'WCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BPL', 'Bhopal', 2 FROM zones z WHERE z.code = 'WCR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'KOTA', 'Kota', 3 FROM zones z WHERE z.code = 'WCR';

-- WR — Western Railway
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'MMCT', 'Mumbai Central', 1 FROM zones z WHERE z.code = 'WR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BRC', 'Vadodara', 2 FROM zones z WHERE z.code = 'WR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'RTM', 'Ratlam', 3 FROM zones z WHERE z.code = 'WR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'ADI', 'Ahmedabad', 4 FROM zones z WHERE z.code = 'WR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'RJT', 'Rajkot', 5 FROM zones z WHERE z.code = 'WR';
INSERT INTO divisions (zone_id, code, name, display_order)
SELECT z.id, 'BVC', 'Bhavnagar', 6 FROM zones z WHERE z.code = 'WR';
