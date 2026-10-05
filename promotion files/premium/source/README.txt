Sprasa HR – premium promo video generator

Needs: the app running (npm run dev), Google Chrome, ffmpeg, Node.js.

  npm install                                   # installs playwright-core
  node capture.js leave attendance payroll tour # drives the app, screenshots every step -> shots/
  node render.js leave                          # renders + encodes -> out/sprasa-hr-ad-leave.mp4
  node render.js attendance | payroll | tour    # the other videos
  node render.js tour 16.3 22.6                 # preview stills at given seconds -> preview/tour/
  node thumb.js                                 # YouTube thumbnail -> out/youtube-thumbnail.jpg

Where to edit
  videos.js   – story, captions, headlines, timing of each video
  engine.html – look and feel (colours, fonts, intro, outro, STS card, contact details)
  thumb.html  – YouTube thumbnail

Demo data
  capture.js makes real changes for the demo employee: a leave request (25–27 Nov 2026)
  and a web check-in that HR approves. Undo them afterwards: copy cleanup.js into backend/
  and run "node cleanup.js" (dry run), then "node cleanup.js --apply".

assets/ holds the Sprasa HR logo, the Sprasa Technical Solution logos, the website QR code
and the Montserrat / Jost fonts from the STS brand kit.
