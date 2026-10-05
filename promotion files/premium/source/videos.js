// Video definitions. Each video is written as a sequence of director steps; the director
// turns them into the timeline the engine renders.
const fs = require('fs');
const path = require('path');

const SHOTS = path.join(__dirname, 'shots');
const meta = () => JSON.parse(fs.readFileSync(path.join(SHOTS, 'meta.json'), 'utf8'));
const targetsOf = (flow) => JSON.parse(fs.readFileSync(path.join(SHOTS, flow, 'targets.json'), 'utf8'));

class Director {
  constructor({ intro, outro, introEnd = 3.3 }) {
    this.t = 0;
    this.pos = { x: 980, y: 600 };
    this.z = { s: 1, ox: 820, oy: 398 };
    this.cursorFrom = null;
    this.tg = {};
    this.v = { intro: { ...intro, t0: 0, t1: introEnd }, outro, shots: [[0, null, 0]], urls: [], moves: [], clicks: [], zooms: [], captions: [], highlights: [], chapters: [], cursorVis: [], corner: [] };
    this.t = introEnd - .5; // window starts rising while the intro pushes away
    this.v.app = { t0: this.t };
  }
  T(flow, name) {
    this.tg[flow] ??= targetsOf(flow);
    const r = this.tg[flow][name];
    if (!r) throw new Error(`no target ${flow}.${name}`);
    return r;
  }
  wait(s) { this.t += s; return this; }
  // type the address and load the first page
  openBrowser(text = 'hr.yourcompany.com') {
    this.t += .9;
    this.v.urlTyping = { t0: this.t, t1: this.t + .8, text };
    this.t += 1.15;
    this.v.firstShot = this.t;
    return this;
  }
  shot(ref, fade = 0) { this.v.shots.push([this.t, ref, fade]); return this; }
  page(ref, urlPath, title, fade = .3) {
    const [flow, name] = ref.split('/');
    this.tg[flow] ??= targetsOf(flow);
    const real = this.tg[flow]._urls?.[name];
    if (real) urlPath = real.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => id.slice(0, 8));
    this.shot(ref, fade); this.v.urls.push([this.t, urlPath, `${title} · Sprasa HR`]); return this; }
  caption(step, html) { this.v.captions.push([this.t, step, html]); return this; }
  showCursor() { this.cursorFrom = this.t; return this; }
  hideCursor() { if (this.cursorFrom != null) this.v.cursorVis.push([this.cursorFrom, this.t]); this.cursorFrom = null; return this; }
  move(flow, name, { dx = 0, dy = 0, dur = .45 } = {}) {
    const r = this.T(flow, name);
    return this.moveXY(r.x + dx, r.y + dy, dur);
  }
  moveXY(x, y, dur = .45) {
    this.v.moves.push([this.t, this.t + dur, this.pos.x, this.pos.y, x, y]);
    this.pos = { x, y }; this.t += dur; return this;
  }
  click(hold = .15) { this.v.clicks.push([this.t, this.pos.x, this.pos.y]); this.t += hold; return this; }
  type(prefix, n, per = .05) { for (let i = 1; i <= n; i++) { this.shot(`${prefix}${i}`); this.t += per; } return this; }
  zoom(s, ox, oy, dur = .75) { this.v.zooms.push([this.t, this.t + dur, this.z.s, this.z.ox, this.z.oy, s, ox, oy]); this.z = { s, ox, oy }; return this; }
  zoomOn(flow, name, s, { dx = 0, dy = 0, dur = .75 } = {}) { const r = this.T(flow, name); return this.zoom(s, r.x + dx, r.y + dy, dur); }
  zoomOut(dur = .75) { return this.zoom(1, this.z.ox, this.z.oy, dur); }
  highlight(flow, name, dur = 1.5, { w, h } = {}) { const r = this.T(flow, name); this.v.highlights.push([this.t, this.t + dur, r.x, r.y, w ?? r.w, h ?? r.h]); return this; }
  chapter(num, title, sub, dur = 2.4) { this.hideCursor(); this.v.chapters.push([this.t, this.t + dur, num, title, sub]); this.caption(0, null); this.t += dur; return this; }
  finish({ outroLen = 4.2, stsLen = 4.6 } = {}) {
    this.hideCursor();
    this.caption(0, null);
    const V = this.v;
    V.app.t1 = this.t;
    V.outro.t0 = this.t + .35;
    V.sts = { t0: V.outro.t0 + outroLen };
    V.duration = +(V.sts.t0 + stsLen).toFixed(2);
    V.corner = [[0, V.intro.t1], [V.outro.t0, V.sts.t0]];
    V.cursorStart = { x: 980, y: 600 };
    if (!V.urls.length) V.urls.push([0, '', 'Sprasa HR']);
    return V;
  }
}

const CHIPS = [['clock', 'Attendance'], ['plane', 'Leave'], ['wallet', 'Payroll'], ['chart', 'Reports'], ['user', 'Self-service']];

const videos = {
  // ---------------------------------------------------------------- Leave ad
  leave() {
    const k = meta().leave.reasonSteps;
    const d = new Director({
      intro: { eyebrow: 'Sprasa HR · Leave', title: 'Leave requests,<br><g>done in seconds.</g>', sub: 'Apply, check balance and get approval — all online.' },
      outro: { head: 'Less paperwork.<br><g>Happier teams.</g>', chips: CHIPS },
    });
    d.openBrowser().page('leave/login', '/login', 'Sign in', .35).caption(1, 'Open <b>Sprasa HR</b> in any browser')
      .wait(.25).showCursor()
      .move('leave', 'user', { dx: -110, dy: 4 }).click().type('leave/user', 8, .045)
      .move('leave', 'pass', { dx: -110, dy: 4, dur: .35 }).click().type('leave/pass', 11, .035)
      .caption(2, 'Employees sign in <b>securely</b>')
      .move('leave', 'signin', { dx: 10, dy: 6, dur: .4 }).click().wait(.15)
      .page('leave/dash', '/app', 'Dashboard').wait(.9)
      .move('leave', 'myleave', { dx: -30, dy: 4, dur: .5 }).click().wait(.1)
      .page('leave/leave', '/app/me/leave', 'My leave').caption(3, 'Apply for leave in <b>a few clicks</b>').wait(.35)
      .move('leave', 'apply', { dy: 6 }).click().wait(.1)
      .shot('leave/dialog', .22).zoomOn('leave', 'dialog', 1.14, { dy: 10 }).wait(.55)
      .move('leave', 'select', { dx: -100, dy: 4 }).click().wait(.12).shot('leave/select', .12)
      .caption(4, 'Leave balance <b>checked instantly</b>').wait(.45)
      .move('leave', 'from', { dx: -40, dy: 4, dur: .4 }).click().shot('leave/from').wait(.25)
      .move('leave', 'to', { dx: -40, dy: 4, dur: .35 }).click().shot('leave/to').wait(.25)
      .move('leave', 'reason', { dx: -120, dy: -10, dur: .35 }).click().type('leave/reason', k, .065).wait(.15)
      .move('leave', 'submit', { dy: 6 }).click().wait(.15)
      .shot('leave/result', .25).zoomOut().caption(5, 'Sent to the manager <b>for approval</b>').wait(.45)
      .move('leave', 'newrow', { dx: -300, dy: 8, dur: .5 }).highlight('leave', 'newrow', 1.7).wait(1.7);
    return d.finish();
  },

  // ---------------------------------------------------------- Attendance ad
  attendance() {
    const d = new Director({
      intro: { eyebrow: 'Sprasa HR · Attendance', title: 'Attendance<br><g>you can trust.</g>', sub: 'Check in from any browser. HR approves every entry.' },
      outro: { head: 'Every check-in,<br><g>verified by HR.</g>', chips: CHIPS },
    });
    d.openBrowser().page('attendance/emp_dash', '/app', 'Dashboard', .35).caption(1, 'Employees check in <b>from any browser</b>')
      .wait(.5).showCursor()
      .zoomOn('attendance', 'checkin', 1.25, { dx: 60, dy: 60 })
      .move('attendance', 'checkin', { dx: 10, dy: 8, dur: .6 }).wait(.3).click().wait(.2)
      .shot('attendance/emp_checked', .22).caption(2, 'Each app check-in <b>goes to HR for approval</b>').wait(1.6)
      .zoomOut().wait(.5).hideCursor()
      .page('attendance/hr_dash', '/app', 'Dashboard', .45).caption(3, 'HR sees what <b>needs approval</b>').wait(1.3)
      .showCursor().move('attendance', 'nav_approvals', { dx: -40, dy: 4, dur: .55 }).click().wait(.1)
      .page('attendance/hr_approvals', '/app/attendance/approvals', 'Check-in approvals').wait(.3)
      .highlight('attendance', 'row', 1.6).wait(.8)
      .zoomOn('attendance', 'approve', 1.25, { dx: 40 })
      .move('attendance', 'approve', { dx: 4, dy: 6, dur: .55 }).wait(.25).click().wait(.15)
      .shot('attendance/hr_approved', .22).caption(4, 'Approved <b>in one click</b>').moveXY(1380, 420, .6).wait(.7)
      .zoomOut().wait(.3)
      .move('attendance', 'nav_attendance', { dx: -40, dy: 4, dur: .55 }).click().wait(.1)
      .page('attendance/hr_attendance', '/app/attendance', 'Attendance').caption(5, 'Daily attendance <b>always up to date</b>').wait(2.0);
    return d.finish();
  },

  // ------------------------------------------------------------- Payroll ad
  payroll() {
    const d = new Director({
      intro: { eyebrow: 'Sprasa HR · Payroll', title: 'Payroll,<br><g>without the headache.</g>', sub: 'Salaries, tax, SSF & PF and payslips — every month.' },
      outro: { head: 'Accurate payroll.<br><g>Every single month.</g>', chips: CHIPS },
    });
    d.openBrowser().page('payroll/runs', '/app/payroll/runs', 'Payroll', .35).caption(1, 'Every payroll month <b>in one place</b>')
      .wait(.4).showCursor().highlight('payroll', 'run_sep', 1.4).move('payroll', 'run_sep', { dx: -380, dy: 6, dur: .6 }).wait(.8).click().wait(.15)
      .page('payroll/run', '/app/payroll/runs/september-2026', 'Payroll September 2026').caption(2, 'Draft → Reviewed → Approved, <b>step by step</b>')
      .zoom(1.15, 820, 240).wait(2.0).zoomOut().wait(.4)
      .shot('payroll/run_scrolled', .4).caption(3, 'Tax, SSF & PF <b>calculated automatically</b>').wait(2.0)
      .page('payroll/payslips', '/app/payroll/payslips', 'Payslips').caption(4, 'A payslip <b>for every employee</b>').wait(.6)
      .move('payroll', 'payslip_row', { dx: -380, dy: 6, dur: .55 }).click().wait(.15)
      .page('payroll/payslip', '/app/payslips/ps-2026-09-emp-0001', 'Payslip').caption(5, 'Print or <b>download as PDF</b>')
      .zoom(1.15, 1150, 230).moveXY(1250, 130, .7).click().wait(1.7);
    return d.finish();
  },

  // ------------------------------------------------------ YouTube product tour
  tour() {
    const k = meta().leave.reasonSteps;
    const d = new Director({
      intro: { eyebrow: 'Product tour', title: 'Sprasa HR<br><g>Full product demo</g>', sub: 'HR & payroll software built for Nepali organisations' },
      outro: { head: 'One simple system for<br><g>your whole HR team.</g>', chips: CHIPS },
      introEnd: 3.6,
    });
    d.openBrowser().page('tour/home', '/', 'HR management software', .35).caption(0, 'Your HR, attendance and payroll <b>on the web</b>').wait(2.6);
    // 01 Dashboard
    d.chapter('01', 'HR <g>dashboard</g>', 'Today’s attendance, leave and payroll at a glance')
      .page('tour/dash', '/app', 'Dashboard', .35).caption(1, 'Live overview of <b>your whole organisation</b>').wait(2.6)
      .shot('tour/dash_scrolled', .45).caption(1, 'Headcount by department and <b>today’s attendance</b>').wait(2.4);
    // 02 People
    d.chapter('02', 'People &amp; <g>records</g>', 'Employee files with Nepal-specific fields')
      .page('tour/employees', '/app/employees', 'Employees', .35).caption(2, 'Every employee <b>in one list</b>').wait(1.2)
      .showCursor().move('tour', 'emp_search', { dx: -60, dy: 4, dur: .6 }).click().type('tour/emp_q', 6, .09).wait(.25).shot('tour/emp_q_result', .2).wait(.6)
      .move('tour', 'emp_row', { dx: -500, dy: 6 }).click().wait(.1)
      .page('tour/emp_profile', '/app/employees/emp-0002', 'Sunita Adhikari').caption(2, 'Complete profile — <b>PAN, SSF, documents & history</b>').hideCursor().wait(2.6)
      .page('tour/orgchart', '/app/org-chart', 'Organisation chart').caption(2, 'Organisation chart from <b>reporting lines</b>').wait(2.4);
    // 03 Attendance
    d.chapter('03', '<g>Attendance</g>', 'Self check-in, shifts, late and overtime')
      .page('attendance/emp_dash', '/app', 'Dashboard', .35).caption(3, 'Employees <b>check in from the browser</b>').wait(.4)
      .showCursor().move('attendance', 'checkin', { dx: 10, dy: 8, dur: .6 }).click().wait(.15)
      .shot('attendance/emp_checked', .22).wait(1.4).hideCursor()
      .page('attendance/hr_approvals', '/app/attendance/approvals', 'Check-in approvals', .4).caption(3, 'HR <b>approves or rejects</b> each check-in').wait(.4)
      .showCursor().highlight('attendance', 'row', 1.3).move('attendance', 'approve', { dx: 4, dy: 6, dur: .7 }).wait(.4).click().wait(.1)
      .shot('attendance/hr_approved', .22).wait(1.2).hideCursor()
      .page('tour/attendance', '/app/attendance', 'Attendance').caption(3, 'Late, early-leave and overtime <b>worked out from shifts</b>').wait(2.4);
    // 04 Leave
    d.chapter('04', '<g>Leave</g> management', 'Balances, approvals and a team calendar')
      .page('leave/leave', '/app/me/leave', 'My leave', .35).caption(4, 'Employees see <b>their balances</b>').wait(.6)
      .showCursor().move('leave', 'apply', { dy: 6, dur: .55 }).click().wait(.1)
      .shot('leave/dialog', .22).zoomOn('leave', 'dialog', 1.12, { dy: 10 }).wait(.4)
      .move('leave', 'select', { dx: -100, dy: 4 }).click().wait(.1).shot('leave/select', .12).caption(4, 'Balance <b>checked as they apply</b>').wait(.5)
      .move('leave', 'to', { dx: -40, dy: 4, dur: .45 }).click().shot('leave/to').wait(.2)
      .move('leave', 'reason', { dx: -120, dy: -10, dur: .35 }).click().type('leave/reason', k, .05).wait(.1)
      .move('leave', 'submit', { dy: 6 }).click().wait(.1)
      .shot('leave/result', .25).zoomOut().caption(4, 'Request goes to the <b>manager, then HR</b>').highlight('leave', 'newrow', 1.6).wait(1.8).hideCursor()
      .page('tour/leave_requests', '/app/leave/requests', 'Leave requests').caption(4, 'Approvers see <b>everything waiting for them</b>').wait(2.3)
      .page('tour/leave_calendar', '/app/leave/calendar', 'Leave calendar').caption(4, 'Who’s away — <b>on one calendar</b>').wait(2.3);
    // 05 Payroll
    d.chapter('05', '<g>Payroll</g> &amp; payslips', 'Tax, SSF and PF worked out every month')
      .page('payroll/runs', '/app/payroll/runs', 'Payroll', .35).caption(5, 'Run payroll <b>once a month</b>').wait(.4)
      .showCursor().move('payroll', 'run_sep', { dx: -380, dy: 6, dur: .6 }).click().wait(.1)
      .page('payroll/run', '/app/payroll/runs/september-2026', 'Payroll September 2026').caption(5, 'Draft → Reviewed → Approved → <b>Paid</b>').hideCursor().wait(2.4)
      .shot('payroll/run_scrolled', .4).caption(5, 'Full register with <b>tax, SSF & PF</b>').wait(2.4)
      .page('payroll/payslip', '/app/payslips/ps-2026-09-emp-0001', 'Payslip').caption(5, 'Payslips employees can <b>download as PDF</b>').wait(2.6);
    // 06 Reports
    d.chapter('06', '<g>Reports</g>', '21 reports, ready to export')
      .page('tour/reports', '/app/reports', 'Reports', .35).caption(6, 'Export to <b>Excel or PDF</b> in a click').wait(3.0);
    return d.finish({ outroLen: 4.6, stsLen: 5.2 });
  },
};

module.exports = { videos };
