Sprasa HR – 20 s leave-request promo generator

Needs: the app running (npm run dev), Google Chrome, ffmpeg.

  npm install                 # installs playwright-core
  node capture.js             # signs in as "employee", applies for leave, screenshots each step -> shots/
  node render.js              # renders 600 frames (30 fps x 20 s) -> frames/
  node render.js 5.5 11.9     # (optional) preview stills at given seconds -> preview/
  ffmpeg -framerate 30 -i frames/f%04d.jpg -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -shortest -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -movflags +faststart -t 20 ../sprasa-hr-leave-promo-20s.mp4

capture.js submits a real leave request (25–27 Nov 2026) for the demo employee.
Remove it afterwards: copy cleanup.js into backend/ and run "node cleanup.js --apply".

Edit text (captions, URL "hr.yourcompany.com", tagline, CTA) and timing in render.html.
