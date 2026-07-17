import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@stores/authStore';
import { logout as apiLogout } from '@api/auth';
import { IR_PORTAL_URL } from '@lib/externalLinks';

import railIcon from '../../assets/images/rail-icon-in.png';
import homeIcon from '../../assets/images/home-icon.png';
import irMapIcon from '../../assets/images/IRMap.png';
import helpIcon from '../../assets/images/helpsm-icon.png';
import editUserIcon from '../../assets/images/edit-user.png';
import addUserIcon from '../../assets/images/add-user.png';
import myProfileIcon from '../../assets/images/newpassword.png';
import themesIcon from '../../assets/images/themes.png';
import logoutIcon from '../../assets/images/logout.png';
import reportIcon from '../../assets/images/my-report2.png';
import outboxIcon from '../../assets/images/outbox.png';
import execAgencyIcon from '../../assets/images/executing-agency.png';
import statusWorkIcon from '../../assets/images/status-work.png';
import dashboardIcon from '../../assets/images/dashboard1.png';
import proposalBankIcon from '../../assets/images/proposal_bank.png';
import irLogo from '../../assets/images/IRLOGO_new.png';

/**
 * LandingPage — the IRPSM-style home screen shown right after a normal
 * (password) login. Full-screen, its own IRPSM chrome (no PIA shell).
 *
 * Behaviours:
 *  - "Welcome <name>" is the logged-in PIA user.
 *  - IR Map toolbar button opens the Indian Railways portal in a new tab.
 *  - Log out button ends the PIA session and returns to /login.
 *  - "PIA" nav tab routes into the Project View (/projects).
 *
 * SSO/JWT logins skip this page entirely — the callback lands on /projects.
 */
export default function LandingPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);

  const handleLogout = async () => {
    // End the PIA session server-side, then land on PIA's own login page. Deliberately does
    // not clear the auth store — nulling currentUser would re-render RequireAuth and flash the
    // PIA /login page before the full-page redirect commits.
    try {
      await apiLogout();
    } finally {
      window.location.href = '/login';
    }
  };

  const openIrPortal = () =>
    window.open(IR_PORTAL_URL, '_blank', 'noopener,noreferrer');

  const openProjectView = () => navigate('/projects');

  return (
    <div className="irpsm-landing">
      <style>{CSS}</style>
      <div className="page">

        {/* ============ HEADER ============ */}
        <header>
          <div className="brand">
            <h1>IRPSM</h1>
            <div className="sub">Indian Railways Projects Sanctions &amp; Management</div>
          </div>
          <div className="welcome">Welcome {currentUser?.name ?? 'User'}</div>
          <div className="emblem" title="Indian Railways">
            <img src={railIcon} alt="Indian Railways" />
          </div>
          <div className="toolbar">
            <img src={homeIcon} alt="Home" />
            <img src={irMapIcon} alt="IR Map" title="Open Indian Railways portal"
                 style={{ cursor: 'pointer' }} onClick={openIrPortal} />
            <img src={helpIcon} alt="Help" />
            <img src={editUserIcon} alt="Edit User" />
            <img src={addUserIcon} alt="Add user" />
            <img src={myProfileIcon} alt="My profile" />
            <img src={themesIcon} alt="Themes" />
            <img src={logoutIcon} alt="Log out" title="Log out"
                 style={{ cursor: 'pointer' }} onClick={() => void handleLogout()} />
          </div>
          <div className="helpline">
            For any query/issue, please write to <a href="#">irpsm@cris.org.in</a> or call.
            For going to old Home screen please click on {'\u{1F3E0}'} icon.
          </div>
        </header>

        {/* ============ NAV ============ */}
        <nav>
          <ul>
            <li>
              <a>Proposal Bank</a>
              <ul className="menu">
                <li><a href="#"><img className="mi" src={reportIcon} alt="" />Summary</a></li>
                <li><a href="#"><img className="mi" src={outboxIcon} alt="" />Outbox</a></li>
              </ul>
            </li>
            <li>
              <a>Sanctioned Works</a>
              <ul className="menu">
                <li><a href="#"><img className="mi" src={execAgencyIcon} alt="" />Allotment of Executing Agency</a></li>
                <li className="has-sub">
                  <a href="#"><img className="mi" src={statusWorkIcon} alt="" />Status of Work</a>
                  <ul className="submenu">
                    <li><a href="#">Physical Progress</a></li>
                    <li><a href="#">Financial Progress</a></li>
                    <li><a href="#">Monthly Progress Entry</a></li>
                  </ul>
                </li>
                <li><a href="#"><img className="mi" src={statusWorkIcon} alt="" />Status of Umbrella &amp; Other Work</a></li>
                <li><a href="#"><img className="mi" src={dashboardIcon} alt="" />Data entry for Project Dashboard</a></li>
                <li><a href="#">NIP Project Data entry</a></li>
                <li><a href="#">Uploading of (.dwg) drawing file of L-section</a></li>
                <li><a href="#">Works Authorized from Other Railways</a></li>
                <li><a href="#">Authorize Works to Other Railways</a></li>
                <li><a href="#">Surveys Completed (Since last 10 years)</a></li>
                <li><a href="#">Surveys Sanctioned (Not Completed)</a></li>
                <li><a href="#">IR-Geo Video Portal</a></li>
              </ul>
            </li>
            <li>
              <a>Report</a>
              <ul className="menu">
                <li><a href="#">Zone-wise Report</a></li>
                <li><a href="#">Plan Head Report</a></li>
                <li><a href="#">Outlay vs Expenditure</a></li>
              </ul>
            </li>
            <li>
              <a>Administration</a>
              <ul className="menu">
                <li><a href="#">Manage Users</a></li>
                <li><a href="#">Map HRMS ID</a></li>
                <li><a href="#">Masters</a></li>
              </ul>
            </li>
            <li>
              <a>Corridor Works</a>
              <ul className="menu">
                <li><a href="#">Corridor Summary</a></li>
                <li><a href="#">Corridor Progress</a></li>
              </ul>
            </li>
            <li>
              <a onClick={openProjectView} style={{ cursor: 'pointer' }}>PIA</a>
            </li>
          </ul>
        </nav>

        {/* icon strip + quick links */}
        <div className="iconstrip">
          <img src={proposalBankIcon} alt="" title="Proposal Bank" />
          <img src={statusWorkIcon} alt="" title="Status of Work" />
          <img src={execAgencyIcon} alt="" title="Allotment of Executing Agency" />
          <img src={reportIcon} alt="" title="Report" />
          <img src={outboxIcon} alt="" title="Outbox" />
          <img src={dashboardIcon} alt="" title="Project Dashboard" />
          <span className="quicklinks">
            | <a href="#">Map HRMS ID</a> | <a href="#">feedback</a> | <a href="#">Get Mobile App</a>
          </span>
        </div>

        <div className="note">
          Note: Please fill the proforma for &quot;Stages of Land Acquisition&quot; through menu
          &quot;Sanctioned Works-&gt; Data entry for Project Dashboard&quot; in &quot;Land &amp; Forest Clearance&quot; tab.
        </div>

        {/* ============ ORANGE DASHBOARD BAR ============ */}
        <div className="dashbar">
          <span className="home" title="Home">
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
              <path fill="#ffffff" d="M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z" />
            </svg>
          </span>
          <span className="pd">Project Dashboard</span>
          <span className="pageicon">{'\u{1F5D1}'}</span>
          <span className="title">IRPSM-Dashboard <span className="beta">Beta</span></span>
          <span className="ext">{'↗'}</span>
        </div>

        {/* ============ BODY ============ */}
        <div className="body">

          {/* LEFT PANEL */}
          <aside className="left">
            <div className="radiorow">
              <label><input type="radio" name="scope" defaultChecked /> Zone Wise</label>
              <label><input type="radio" name="scope" /> State Wise</label>
            </div>
            <div className="breadcrumb">
              <span className="ir">IR</span> &raquo; <b>ECR</b>
              <span className="search">{'\u{1F50D}'}</span>
            </div>
            <input className="searchbox" placeholder="Search Exec. Agency" />
            <div className="tree" style={{ position: 'relative', minHeight: 120 }}>
              <div className="zone">ECR</div>
              <div className="child">{'∟'} CAO(CON)/ECR</div>
              <img src={irLogo} alt=""
                   style={{ position: 'absolute', right: 8, bottom: 8, width: 96, height: 96,
                            opacity: 0.55, filter: 'brightness(0) invert(.55)' }} />
            </div>
            <div className="flagged">Flagged Projects <span className="arrow">{'➔'}</span></div>
          </aside>

          {/* RIGHT PANEL */}
          <section className="right">

            {/* FILTER */}
            <fieldset className="filter">
              <legend>Filter Criteria</legend>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', paddingTop: 4 }}>Plan Head :</div>
                <div className="planheads">
                  <span className="ph on">NL</span><span className="ph on">GC</span><span className="ph on">DL</span>
                  <span className="ph on">TRF</span><span className="ph off">17</span><span className="ph off">18</span>
                  <span className="ph on">LC</span><span className="ph on">ROB/RUB</span><span className="ph off">31</span>
                  <span className="ph on">BW</span><span className="ph off">33</span><span className="ph off">35</span>
                  <span className="ph off">36</span><span className="ph on">W&amp;PU</span><span className="ph on">SW</span>
                  <span className="ph on">PA</span><span className="ph on">OSW</span><span className="ph off">65</span>
                  <span className="ph off">81</span><span className="ph deselect">De-Select All</span>
                </div>
              </div>
              <div className="filternote">
                Note:- Plan Heads in blue have been selected. For individual selection/deselection
                press &apos;De-Select All&apos; and choose as required.
              </div>
              <div className="filterrow">
                <b>Work Category :</b>
                <select><option>ALL</option><option>New Line</option><option>Doubling</option></select>
                <b style={{ marginLeft: 20 }}>Work Orignal Cost :</b>
                <select><option>ALL</option><option>&lt; 100 cr</option><option>&gt; 100 cr</option></select>
              </div>
              <div className="filterrow sancbefore">
                <b>Sanctioned Before :</b>
                <a href="#" className="active">ALL</a> | <a href="#">&gt; 2 Year</a> |
                <a href="#">&gt; 5 Year</a> | <a href="#">&gt; 10 Year</a>
              </div>
            </fieldset>

            {/* KPI CARDS */}
            <div className="kpis">
              <div className="kpi blue">
                <a className="link" href="#">{'\u{1F517}'}</a>
                <div className="lbl">Total Rly. Works</div>
                <div className="num">294 <span className="nos">Nos.</span></div>
                <div className="sub">(Excluding Deposit Works)</div>
                <div className="amt">{'₹'} 98,405 cr</div>
              </div>
              <div className="kpi green">
                <a className="link" href="#">{'\u{1F517}'}</a>
                <div className="lbl">Phy. Completed</div>
                <div className="num">80 <span className="nos">Nos.</span></div>
                <div className="amt">{'₹'} 33,891 cr</div>
              </div>
              <div className="kpi yellow">
                <a className="link" href="#">{'\u{1F517}'}</a>
                <div className="lbl">Unsanctioned (#)</div>
                <div className="num">1 <span className="nos">Nos.</span></div>
                <div className="amt">{'₹'} 300 cr</div>
              </div>
              <div className="kpi red">
                <a className="link" href="#">{'\u{1F517}'}</a>
                <div className="lbl">Frozen</div>
                <div className="num">11 <span className="nos">Nos.</span></div>
                <div className="amt">{'₹'} 6,121 cr</div>
              </div>
            </div>

            {/* ON GOING WORKS */}
            <div className="ongoing">
              <h3>On Going Works</h3>
              <div className="grid">
                <div>
                  <div className="bignum">202 <div style={{ fontSize: 11, fontWeight: 'normal' }}>Nos.</div></div>
                  <div className="money" style={{ marginTop: 8 }}>{'₹'} 58,093 cr</div>
                </div>
                <div>
                  <div><b>Expenditure</b></div>
                  <div className="muted">Upto Last Fin. Year</div>
                  <div className="money">{'₹'} 16,250 cr</div>
                  <div className="muted" style={{ marginTop: 6 }}>Current Fin. Year</div>
                  <div className="money">{'₹'} 2,083 cr</div>
                </div>
                <div>
                  <div><b>Outlay</b> <span className="muted">(Current Fin. Yr)</span></div>
                  <div className="muted">Original:</div>
                  <div className="money">{'₹'} 4,730 cr</div>
                  <div className="muted" style={{ marginTop: 6 }}>Revised:</div>
                  <div className="money">{'₹'} 4,464 cr</div>
                </div>
                <div>
                  <div><b>Throw Forward</b></div>
                  <div className="money">{'₹'} 37,379 cr</div>
                  <div className="muted">(On 1st April of next Financial Year)</div>
                </div>
              </div>
              <div className="footnote">* Current Financial Year is 2026-2027 in IRPSM.</div>
            </div>

            {/* THREE CARDS */}
            <div className="threecards">
              <div className="card">
                <div className="ttl">(On Going + Phy. Completed) Works - Detailed Estimate yet to be Sanctioned</div>
                <div className="big">63 <span style={{ fontSize: 11 }}>Nos.</span></div>
                <div className="go">{'➔'}</div>
                <div className="amt">{'₹'} 9,614 cr</div>
              </div>
              <div className="card">
                <div className="ttl">(On Going + Phy. Completed) Works - Revised Estimate yet to be Sanctioned</div>
                <div className="big">74 <span style={{ fontSize: 11 }}>Nos.</span></div>
                <div className="go">{'➔'}</div>
                <div className="amt">{'₹'} 38,379 cr</div>
              </div>
              <div className="card">
                <div className="ttl">(On Going + Phy. Completed) Works - Estimate Status not recorded in Monthly Progress</div>
                <div className="big">24 <span style={{ fontSize: 11 }}>Nos.</span></div>
                <div className="amt">{'₹'} 3,804 cr</div>
              </div>
            </div>

            {/* PHYSICAL PROGRESS 75%+ */}
            <div className="prog">
              <h3>On Going Works - Physical Progress 75% and above</h3>
              <div className="grid">
                <div className="bignum">25 <div style={{ fontSize: 11, fontWeight: 'normal' }}>Nos.</div></div>
                <div>
                  <div><b>Expenditure</b></div>
                  <div className="muted">Upto Last Fin. Year</div>
                  <div className="money">{'₹'} 10,601 cr</div>
                  <div className="muted" style={{ marginTop: 6 }}>Current Fin. Year</div>
                  <div className="money">{'₹'} 673 cr</div>
                </div>
                <div>
                  <div><b>Outlay</b> <span className="muted">(Current Fin. Yr)</span></div>
                  <div className="muted">Original:</div>
                  <div className="money">{'₹'} 929 cr</div>
                  <div className="muted" style={{ marginTop: 6 }}>Revised:</div>
                  <div className="money">{'₹'} 662 cr</div>
                </div>
                <div>
                  <div><b>Throw Forward</b></div>
                  <div className="money">{'₹'} 2,080 cr</div>
                  <div className="muted">(On 1st April of next Financial Year)</div>
                </div>
              </div>
              <div className="footnote">* Current Financial Year is 2026-2027 in IRPSM.</div>
            </div>

          </section>
        </div>

        <div className="disclaimer">
          Mock / dummy dashboard — visual replica of the IRPSM dashboard. All figures are
          placeholder data and not from any live system.
        </div>

      </div>
    </div>
  );
}

/* All selectors are scoped under .irpsm-landing so this page's IRPSM chrome
   never leaks into the rest of the PIA app. */
const CSS = `
  .irpsm-landing { height: 100%; overflow: auto; background: #d9d9d9;
    font-family: Verdana, Geneva, Tahoma, sans-serif; font-size: 12px; color: #222; }
  .irpsm-landing * { box-sizing: border-box; }
  .irpsm-landing a { color: #0645ad; text-decoration: none; }
  .irpsm-landing a:hover { text-decoration: underline; }

  .irpsm-landing .page { max-width: 1000px; margin: 0 auto; background: #fff; border: 1px solid #7fae7f; }

  .irpsm-landing header { padding: 8px 14px 4px; position: relative; }
  .irpsm-landing .brand h1 { margin: 0; color: #2e7d32; font-size: 26px; font-weight: bold; letter-spacing: .5px; }
  .irpsm-landing .brand .sub { color: #333; font-size: 13px; font-style: italic; }
  .irpsm-landing .welcome { position: absolute; top: 8px; right: 70px; color: #7a1f1f; font-size: 12px; font-weight: bold; }
  .irpsm-landing .emblem { position: absolute; top: 6px; right: 12px; width: 58px; height: 58px; }
  .irpsm-landing .emblem img { width: 100%; height: 100%; object-fit: contain; }
  .irpsm-landing .toolbar { position: absolute; top: 34px; right: 84px; display: flex; gap: 12px; align-items: flex-end; }
  .irpsm-landing .toolbar img { height: 34px; width: auto; }
  .irpsm-landing .helpline { text-align: center; color: #c0392b; font-size: 11px; margin: 26px 0 6px; }

  .irpsm-landing nav { background: linear-gradient(#8a8a8a, #6f6f6f); border-top: 1px solid #999; }
  .irpsm-landing nav > ul { list-style: none; margin: 0; padding: 0; display: flex; }
  .irpsm-landing nav > ul > li { position: relative; }
  .irpsm-landing nav > ul > li > a { display: block; color: #fff; font-weight: bold; font-size: 12px; padding: 8px 16px; cursor: pointer; }
  .irpsm-landing nav > ul > li:hover > a { background: #7a1f1f; }

  .irpsm-landing .menu { display: none; position: absolute; top: 100%; left: 0; min-width: 250px; z-index: 30;
    background: #7a1f1f; border: 1px solid #4d1010; box-shadow: 2px 4px 10px rgba(0,0,0,.4); }
  .irpsm-landing nav > ul > li:hover > .menu { display: block; }
  .irpsm-landing .menu a { display: block; color: #fff; font-weight: normal; padding: 6px 14px; white-space: nowrap; position: relative; }
  .irpsm-landing .menu a img.mi { height: 15px; width: 15px; object-fit: contain; vertical-align: middle; margin-right: 7px; }
  .irpsm-landing .menu a:hover { background: #9c2a2a; text-decoration: none; }
  .irpsm-landing .menu li { list-style: none; position: relative; }
  .irpsm-landing .menu li + li a { border-top: 1px solid #6a1a1a; }

  .irpsm-landing .submenu { display: none; position: absolute; top: 0; left: 100%; min-width: 220px;
    background: #7a1f1f; border: 1px solid #4d1010; box-shadow: 2px 4px 10px rgba(0,0,0,.4); }
  .irpsm-landing .has-sub:hover > .submenu { display: block; }
  .irpsm-landing .has-sub > a::after { content: "\\25B6"; position: absolute; right: 10px; font-size: 9px; opacity: .85; }

  .irpsm-landing .iconstrip { display: flex; gap: 8px; padding: 4px 8px; background: #fff; align-items: center; }
  .irpsm-landing .iconstrip img { height: 20px; width: auto; cursor: pointer; }
  .irpsm-landing .quicklinks { margin-left: auto; padding: 3px 10px; }
  .irpsm-landing .quicklinks a { margin-left: 8px; font-weight: bold; }

  .irpsm-landing .note { color: #1a4bd6; font-weight: bold; padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #cfe0cf; }

  .irpsm-landing .dashbar { background: #f5821f; color: #fff; display: flex; align-items: center; gap: 10px; padding: 8px 12px; font-weight: bold; }
  .irpsm-landing .dashbar .home, .irpsm-landing .dashbar .pageicon, .irpsm-landing .dashbar .ext { background: rgba(255,255,255,.25); border-radius: 4px; padding: 4px 7px; cursor: pointer; }
  .irpsm-landing .dashbar .pd { background: #17a2b8; border-radius: 4px; padding: 4px 9px; font-size: 12px; }
  .irpsm-landing .dashbar .title { flex: 1; text-align: center; font-size: 16px; }
  .irpsm-landing .dashbar .beta { background: #17a2b8; border-radius: 3px; padding: 1px 6px; font-size: 11px; margin-left: 6px; }

  .irpsm-landing .body { display: flex; gap: 10px; padding: 10px; }
  .irpsm-landing .left { width: 250px; flex: 0 0 250px; }
  .irpsm-landing .right { flex: 1; }

  .irpsm-landing .radiorow { display: flex; gap: 18px; background: #ffe3c9; border: 1px solid #f0b880; border-radius: 4px; padding: 6px 10px; }
  .irpsm-landing .breadcrumb { margin-top: 8px; background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; display: flex; align-items: center; gap: 6px; }
  .irpsm-landing .breadcrumb .ir { background: #eee; border: 1px solid #bbb; border-radius: 3px; padding: 1px 6px; font-weight: bold; }
  .irpsm-landing .breadcrumb .search { margin-left: auto; }
  .irpsm-landing .searchbox { margin-top: 6px; width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 3px; }
  .irpsm-landing .tree { margin-top: 6px; background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 8px; }
  .irpsm-landing .tree .zone { font-weight: bold; }
  .irpsm-landing .tree .child { margin: 4px 0 0 16px; color: #333; }
  .irpsm-landing .flagged { margin-top: 12px; background: #fff; border: 1px solid #d9c2ec; border-radius: 8px;
    box-shadow: 0 2px 6px rgba(120,80,160,.25); padding: 18px; text-align: center; font-weight: bold; font-size: 14px;
    display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
  .irpsm-landing .flagged .arrow { color: #2f66b5; font-size: 16px; }

  .irpsm-landing .filter { border: 1px solid #f0b880; border-radius: 4px; padding: 10px; }
  .irpsm-landing .filter legend { color: #c0392b; font-weight: bold; padding: 0 6px; }
  .irpsm-landing .planheads { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 8px; align-items: center; }
  .irpsm-landing .ph { border: none; border-radius: 3px; padding: 4px 10px; font-size: 11px; font-weight: bold; color: #fff; cursor: pointer; }
  .irpsm-landing .ph.on { background: #2f66b5; }
  .irpsm-landing .ph.off { background: #9e9e9e; }
  .irpsm-landing .ph.deselect { background: #2e9e4f; }
  .irpsm-landing .filternote { color: #c0392b; font-size: 11px; margin: 4px 0 10px; }
  .irpsm-landing .filterrow { display: flex; align-items: center; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
  .irpsm-landing .filterrow select { padding: 3px 6px; }
  .irpsm-landing .sancbefore a { margin: 0 6px; font-weight: bold; }
  .irpsm-landing .sancbefore a.active { color: #c0392b; text-decoration: underline; }

  .irpsm-landing .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
  .irpsm-landing .kpi { border-radius: 6px; padding: 10px; position: relative; min-height: 92px; }
  .irpsm-landing .kpi .lbl { font-weight: bold; font-size: 12px; }
  .irpsm-landing .kpi .sub { font-size: 10px; color: #555; }
  .irpsm-landing .kpi .num { font-size: 20px; font-weight: bold; }
  .irpsm-landing .kpi .nos { font-size: 11px; color: #444; }
  .irpsm-landing .kpi .amt { position: absolute; bottom: 8px; left: 10px; font-weight: bold; }
  .irpsm-landing .kpi.blue { background: #dce9fb; border: 1px solid #9bbef0; }
  .irpsm-landing .kpi.green { background: #dbf3e2; border: 1px solid #91d3a6; }
  .irpsm-landing .kpi.yellow { background: #fdf3d0; border: 1px solid #e6cf78; }
  .irpsm-landing .kpi.red { background: #fbdcde; border: 1px solid #efa1a7; }
  .irpsm-landing .link { position: absolute; top: 8px; right: 8px; color: #2e9e4f; }

  .irpsm-landing .ongoing { margin-top: 12px; background: #e6fbf1; border: 1px solid #9fe0c2; border-radius: 6px; padding: 10px; }
  .irpsm-landing .ongoing h3 { margin: 0 0 8px; font-size: 14px; }
  .irpsm-landing .ongoing .grid { display: grid; grid-template-columns: 130px 1fr 1fr 1fr; gap: 10px; align-items: start; }
  .irpsm-landing .bignum { background: #17a2b8; color: #fff; font-size: 22px; font-weight: bold; border-radius: 4px; padding: 10px; text-align: center; }
  .irpsm-landing .money { color: #d35400; font-weight: bold; }
  .irpsm-landing .muted { color: #666; font-size: 10px; }

  .irpsm-landing .threecards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
  .irpsm-landing .card { background: #fdeeee; border: 1px solid #f0c9c9; border-radius: 6px; padding: 10px; position: relative; min-height: 150px; }
  .irpsm-landing .card .ttl { font-weight: bold; font-size: 12px; min-height: 48px; }
  .irpsm-landing .card .big { background: #17a2b8; color: #fff; display: inline-block; font-size: 18px; font-weight: bold; border-radius: 4px; padding: 6px 12px; margin-top: 8px; }
  .irpsm-landing .card .amt { position: absolute; bottom: 10px; left: 10px; font-weight: bold; }
  .irpsm-landing .card .go { position: absolute; bottom: 46px; right: 12px; background: #2f66b5; color: #fff;
    width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

  .irpsm-landing .prog { margin-top: 12px; background: #fbfde6; border: 1px solid #dfe08f; border-radius: 6px; padding: 10px; }
  .irpsm-landing .prog h3 { margin: 0 0 8px; font-size: 14px; }
  .irpsm-landing .prog .grid { display: grid; grid-template-columns: 130px 1fr 1fr 1fr; gap: 10px; align-items: start; }
  .irpsm-landing .footnote { color: #1a4bd6; font-size: 11px; margin-top: 10px; }

  .irpsm-landing .disclaimer { background: #fff8e1; border-top: 1px solid #e6cf78; color: #7a5c00; font-size: 11px; padding: 6px 12px; }
`;
